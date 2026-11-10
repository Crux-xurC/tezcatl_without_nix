
defmodule LspServer do
  # One GenServer per {root, serverId}. Owns the OS process (a `--stdio`
  # language server, no PTY), the LSP base-protocol framing, and the
  # initialize/shutdown lifecycle. Many browser consumers attach; the server
  # sees one client (this relay).
  #
  # Multiplexing:
  #  - initialize: the relay sends its own once, caches the result; a consumer's
  #    `initialize` request is answered locally from that cache, never forwarded.
  #    `shutdown`/`exit` from a consumer just detaches it.
  #  - requests consumer -> server: the `id` is rewritten to a relay-global int
  #    and mapped back when the response returns.
  #  - notifications server -> consumers: broadcast to every attached consumer
  #    (the CM6 client filters diagnostics by uri).
  #  - server -> client requests (configuration, registerCapability, ...) are
  #    answered by the relay with safe defaults.
  #  - one consumer owns each open document (LspOwners, D-lsp-owner): only its
  #    didOpen / didChange / didSave / didClose reach the server, the
  #    diagnostics of that URI go to it alone, and another editor's request
  #    about it is refused. An editor takes a URI over from a scanner.
  #
  # Lifecycle: when the last consumer detaches a grace timer starts; if it fires
  # with no consumer, the server is shut down.

  use GenServer
  require Logger

  @grace_ms 45_000
  # An integer, never a string: elixir-ls 0.30.0 rejects a string request id
  # ("expected an integer") and terminates, although LSP allows both.
  # Consumer requests are renumbered from next_gid = 1 up, so 0 never
  # collides with one.
  @relay_init_id 0

  @client_caps %{
    "textDocument" => %{
      "synchronization" => %{"didSave" => true, "dynamicRegistration" => false},
      "publishDiagnostics" => %{"relatedInformation" => true},
      "completion" => %{
        "completionItem" => %{
          "snippetSupport" => false,
          "documentationFormat" => ["markdown", "plaintext"]
        },
        "contextSupport" => true
      },
      "hover" => %{"contentFormat" => ["markdown", "plaintext"]},
      "definition" => %{"linkSupport" => false},
      "references" => %{},
      "documentSymbol" => %{"hierarchicalDocumentSymbolSupport" => true},
      "signatureHelp" => %{}
    },
    "workspace" => %{"workspaceFolders" => true, "configuration" => true},
    "window" => %{"workDoneProgress" => true}
  }

  # ---- API ---------------------------------------------------------------

  @doc """
  The `file://` URI of an absolute path, its path percent-encoded
  ): every byte but the unreserved ones (`A-Z a-z 0-9 -. _ ~`) and
  `/` becomes `%XX`, as vscode-uri writes it. A raw space or a non-ASCII
  name was not a valid URI, and a server that writes its URIs encoded
  (typescript-language-server, nil) sent diagnostics under a URI the editor
  did not know -- they were dropped; a `#` or `%` in a path named another
  file. xipe_totec's `Scanner.Lsp` encodes the same way: `didOpen` is
  counted by the URI string here, so the editor and xipe_totec must agree.
  """
  def file_uri(abs) when is_binary(abs),
    do: "file://" <> URI.encode(abs, &(URI.char_unreserved?(&1) or &1 == ?/))

  def child_spec(spec) do
    %{id: __MODULE__, start: {__MODULE__, :start_link, [spec]}, restart: :temporary}
  end

  def start_link(%{argv: _, root: _, server_id: _} = spec),
    do: GenServer.start_link(__MODULE__, spec)

  # LspRegistry passes `init_options` through from lsp.json (optional).

  # client: "editor" for a code editor (lsp-attach.js), anything else otherwise (LspOwners)
  def attach(pid, consumer, client \\ nil), do: GenServer.call(pid, {:attach, consumer, client})
  def detach(pid, consumer), do: GenServer.cast(pid, {:detach, consumer})
  def from_consumer(pid, consumer, text), do: GenServer.cast(pid, {:msg, consumer, text})
  def info(pid), do: GenServer.call(pid, :info)
  def stop(pid), do: GenServer.call(pid, :stop)

  # ---- init ------------------------------------------------------------

  @impl true
  def init(%{argv: argv, root: root, server_id: server_id} = spec) do
    init_options = Map.get(spec, :init_options)

    case Application.ensure_all_started(:erlexec) do
      {:ok, _} -> :ok
      {:error, r} -> raise "erlexec failed to start: #{inspect(r)}"
    end

    # the project's environment (D-project-env), then TERM over it
    env = Map.get(spec, :env, []) ++ [{~c"TERM", ~c"dumb"}]
    opts = [:stdin, :stdout, :stderr, :monitor, {:cd, String.to_charlist(root)}, {:env, env}]

    case :exec.run(argv, opts) do
      {:ok, _pid, ospid} ->
        Logger.info("lsp[#{server_id}]: started #{inspect(argv)} pid=#{ospid} cd=#{root}")

        state = %{
          key: {root, server_id},
          root: root,
          root_uri: file_uri(root),
          server_id: server_id,
          ospid: ospid,
          framer: LspFraming.new(),
          init_state: :initializing,
          init_reply: nil,
          consumers: %{},
          pending_consumer_init: [],
          next_gid: 1,
          pending: %{},
          owners: LspOwners.new(),
          grace_timer: nil
        }

        send_to_server(initialize_frame(root, init_options), state)
        {:ok, state}

      {:error, reason} ->
        {:stop, "exec.run failed: #{inspect(reason)}"}
    end
  end

  defp initialize_frame(root, init_options) do
    params = %{
      # :null -> JSON null. A bare `nil` would encode as the string "nil".
      "processId" => :null,
      "clientInfo" => %{"name" => "tezcatl-relay", "version" => "0"},
      "rootUri" => file_uri(root),
      "capabilities" => @client_caps,
      "workspaceFolders" => [%{"uri" => file_uri(root), "name" => Path.basename(root)}]
    }

    params =
      if is_map(init_options),
        do: Map.put(params, "initializationOptions", init_options),
        else: params

    encode(%{"jsonrpc" => "2.0", "id" => @relay_init_id, "method" => "initialize", "params" => params})
  end

  # ---- calls ---------------------------------------------------------

  @impl true
  def handle_call({:attach, consumer, client}, _from, state) do
    state =
      if Map.has_key?(state.consumers, consumer) do
        state
      else
        mon = Process.monitor(consumer)
        put_in(state.consumers[consumer], %{mon: mon, editor: client == "editor"})
      end

    state = cancel_grace(state)
    {:reply, {:ok, %{root_uri: state.root_uri, server_id: state.server_id}}, state}
  end

  def handle_call(:info, _from, state) do
    {:reply,
     %{
       key: state.key,
       root: state.root,
       server_id: state.server_id,
       status: state.init_state,
       ospid: state.ospid,
       consumers: map_size(state.consumers),
       docs: LspOwners.docs(state.owners)
     }, state}
  end

  def handle_call(:stop, _from, state) do
    do_shutdown(state)
    {:stop, :normal, :ok, state}
  end

  # ---- casts -------------------------------------------------------

  @impl true
  def handle_cast({:detach, consumer}, state) do
    {:noreply, detach_consumer(consumer, state)}
  end

  def handle_cast({:msg, consumer, text}, state) do
    {:noreply, from_consumer_msg(consumer, text, state)}
  end

  # ---- server process io ------------------------------------------

  @impl true
  def handle_info({:stdout, ospid, data}, %{ospid: ospid} = state) do
    {msgs, dropped, framer} = LspFraming.feed_report(state.framer, data)

    # what the server (or a wrapper around it) printed on stdout outside a frame
    for junk <- dropped do
      Logger.warning("lsp[#{state.server_id}]: stdout outside a frame, dropped: #{inspect(String.slice(junk, 0, 300))}")
    end

    state = Enum.reduce(msgs, %{state | framer: framer}, &handle_server_msg/2)
    {:noreply, state}
  end

  def handle_info({:stderr, ospid, data}, %{ospid: ospid} = state) do
    Logger.debug("lsp[#{state.server_id}] stderr: #{String.trim_trailing(to_string(data))}")
    {:noreply, state}
  end

  def handle_info({:DOWN, ospid, :process, _pid, reason}, %{ospid: ospid} = state)
      when is_integer(ospid) do
    code = exit_code(reason)
    Logger.info("lsp[#{state.server_id}]: process #{ospid} exited (#{inspect(reason)}) -> #{code}")
    for c <- Map.keys(state.consumers), do: send(c, {:lsp_exit, code})
    {:stop, :normal, %{state | ospid: nil}}
  end

  def handle_info({:DOWN, mon, :process, consumer, _reason}, state) when is_reference(mon) do
    # a consumer's cowboy process died without terminate/3
    if Enum.any?(state.consumers, fn {_p, %{mon: m}} -> m == mon end) do
      {:noreply, detach_consumer(consumer, state)}
    else
      {:noreply, state}
    end
  end

  def handle_info(:grace_shutdown, state) do
    if map_size(state.consumers) == 0 do
      Logger.info("lsp[#{state.server_id}]: no consumers, shutting down")
      do_shutdown(state)
      {:stop, :normal, %{state | grace_timer: nil}}
    else
      {:noreply, %{state | grace_timer: nil}}
    end
  end

  def handle_info(_other, state), do: {:noreply, state}

  # ---- consumer -> server -------------------------------------------

  defp from_consumer_msg(consumer, text, state) do
    case decode(text) do
      {:ok, %{"method" => "initialize", "id" => oid}} ->
        case state.init_state do
          :ready ->
            reply_to_consumer(consumer, %{
              "jsonrpc" => "2.0",
              "id" => oid,
              "result" => state.init_reply
            })

            state

          :failed ->
            reply_to_consumer(consumer, %{
              "jsonrpc" => "2.0",
              "id" => oid,
              "error" => %{"code" => -32603, "message" => "language server failed to initialize"}
            })

            state

          _ ->
            update_in(state.pending_consumer_init, &(&1 ++ [{consumer, oid}]))
        end

      {:ok, %{"method" => "initialized"}} ->
        state

      {:ok, %{"method" => "shutdown", "id" => oid}} ->
        reply_to_consumer(consumer, %{"jsonrpc" => "2.0", "id" => oid, "result" => :null})
        state

      {:ok, %{"method" => "exit"}} ->
        detach_consumer(consumer, state)

      {:ok, %{"method" => "textDocument/didOpen", "params" => %{"textDocument" => %{"uri" => uri}}}} ->
        {actions, owners} = LspOwners.open(state.owners, uri, consumer, editor_fn(state))
        run_owner_actions(actions, text, %{state | owners: owners})

      {:ok, %{"method" => "textDocument/didClose", "params" => %{"textDocument" => %{"uri" => uri}}}} ->
        {actions, owners} = LspOwners.close(state.owners, uri, consumer, editor_fn(state))
        run_owner_actions(actions, text, %{state | owners: owners})

      # an editor's request about a document another consumer owns: its
      # positions are in its own text, not the server's -- refused here
      {:ok, %{"id" => oid, "method" => _, "params" => %{"textDocument" => %{"uri" => uri}}}}
      when is_binary(uri) ->
        if editor?(state, consumer) and not LspOwners.may_change?(state.owners, uri, consumer) do
          reply_to_consumer(consumer, %{
            "jsonrpc" => "2.0",
            "id" => oid,
            "error" => %{"code" => -32803, "message" => "this file is open in another code_editor: its language server answers there"}
          })

          state
        else
          forward_request(consumer, oid, text, state)
        end

      {:ok, %{"id" => oid, "method" => _}} ->
        forward_request(consumer, oid, text, state)

      # $/cancelRequest names a request by the consumer's own id; the server
      # knows it by the id the relay gave it (next_gid, above). Sent on with
      # that id -- as it was, it cancelled nothing, or another consumer's
      # request that happened to have the number. One already answered (or
      # never seen) is dropped.
      {:ok, %{"method" => "$/cancelRequest", "params" => %{"id" => oid}} = msg} ->
        case cancel_gid(state.pending, consumer, oid) do
          nil -> :ok
          gid -> send_to_server(encode(Map.put(msg, "params", %{"id" => gid})), state)
        end

        state

      # didChange, didSave ... about a document: only its owner's go on
      {:ok, %{"method" => _, "params" => %{"textDocument" => %{"uri" => uri}}}} when is_binary(uri) ->
        if LspOwners.may_change?(state.owners, uri, consumer), do: send_to_server(text, state)
        state

      {:ok, %{"method" => _}} ->
        # plain notification -- pass through
        send_to_server(text, state)
        state

      _ ->
        Logger.debug("lsp[#{state.server_id}]: undecodable consumer frame")
        state
    end
  end

  # the relay's id of the request `consumer` sent as `oid` and still waits for (nil: none)
  def cancel_gid(pending, consumer, oid) do
    Enum.find_value(pending, fn
      {gid, {^consumer, ^oid}} -> gid
      _ -> nil
    end)
  end

  # ---- server -> consumer(s) --------------------------------------

  defp handle_server_msg(text, state) do
    case decode(text) do
      {:ok, %{"id" => id, "method" => method} = msg} ->
        answer_server_request(id, method, msg["params"], state)

      {:ok, %{"id" => id} = msg} ->
        route_response(id, msg, state)

      # a document's diagnostics go to its owner (the text they were made from)
      {:ok, %{"method" => "textDocument/publishDiagnostics", "params" => %{"uri" => uri}}} when is_binary(uri) ->
        case LspOwners.owner(state.owners, uri) do
          nil -> broadcast(text, state)
          owner -> send(owner, {:lsp_out, text})
        end

        state

      {:ok, %{"method" => _}} ->
        broadcast(text, state)
        state

      _ ->
        Logger.debug("lsp[#{state.server_id}]: undecodable server frame")
        state
    end
  end

  defp route_response(@relay_init_id, %{"error" => err}, %{init_state: :initializing} = state) do
    Logger.warning("lsp[#{state.server_id}]: server rejected initialize: #{inspect(err)}")

    Enum.each(state.pending_consumer_init, fn {pid, oid} ->
      reply_to_consumer(pid, %{"jsonrpc" => "2.0", "id" => oid, "error" => err})
    end)

    for c <- Map.keys(state.consumers), do: send(c, {:lsp_exit, -1})
    # the server prints its reason and exits; the DOWN handler stops us
    %{state | init_state: :failed, init_reply: nil, pending_consumer_init: []}
  end

  defp route_response(@relay_init_id, msg, %{init_state: :initializing} = state) do
    result = msg["result"] || %{}
    send_to_server(encode(%{"jsonrpc" => "2.0", "method" => "initialized", "params" => %{}}), state)
    state = %{state | init_state: :ready, init_reply: result}

    Enum.each(state.pending_consumer_init, fn {pid, oid} ->
      reply_to_consumer(pid, %{"jsonrpc" => "2.0", "id" => oid, "result" => result})
    end)

    %{state | pending_consumer_init: []}
  end

  defp route_response(id, msg, state) do
    case Map.pop(state.pending, id) do
      {{consumer, oid}, rest} ->
        reply_to_consumer(consumer, Map.put(msg, "id", oid))
        %{state | pending: rest}

      {nil, _} ->
        Logger.debug("lsp[#{state.server_id}]: response for unknown id #{inspect(id)}")
        state
    end
  end

  defp answer_server_request(id, method, params, state) do
    result =
      case method do
        "client/registerCapability" -> :null
        "client/unregisterCapability" -> :null
        "window/workDoneProgress/create" -> :null
        "window/showMessageRequest" -> :null
        "workspace/semanticTokens/refresh" -> :null
        "workspace/codeLens/refresh" -> :null
        "workspace/diagnostic/refresh" -> :null
        "workspace/inlayHint/refresh" -> :null
        "workspace/workspaceFolders" ->
          [%{"uri" => state.root_uri, "name" => Path.basename(state.root)}]

        # an empty settings object per item, not null: a server reading its
        # settings off it (vscode-css/html-language-server) threw on null and
        # stopped validating -- no diagnostics at all
        "workspace/configuration" ->
          for _ <- (params || %{})["items"] || [], do: %{}

        _ ->
          {:error, -32601, "tezcatl relay does not implement #{method}"}
      end

    frame =
      case result do
        {:error, code, m} ->
          %{"jsonrpc" => "2.0", "id" => id, "error" => %{"code" => code, "message" => m}}

        ok ->
          %{"jsonrpc" => "2.0", "id" => id, "result" => ok}
      end

    send_to_server(encode(frame), state)
    state
  end

  # ---- document owners (LspOwners) ------------------------------------

  defp editor?(state, c), do: get_in(state.consumers, [c, :editor]) == true
  defp editor_fn(state), do: fn c -> editor?(state, c) end

  defp run_owner_actions(actions, text, state) do
    Enum.each(actions, fn
      {:forward, _uri} -> send_to_server(text, state)
      {:server_close, uri} -> send_to_server(did_close(uri), state)
      {:held, c, uri} -> send(c, {:lsp_held, uri})
      {:released, c, uri} -> send(c, {:lsp_released, uri})
    end)

    state
  end

  defp did_close(uri) do
    encode(%{"jsonrpc" => "2.0", "method" => "textDocument/didClose", "params" => %{"textDocument" => %{"uri" => uri}}})
  end

  defp forward_request(consumer, oid, text, state) do
    case decode(text) do
      {:ok, msg} ->
        gid = state.next_gid
        send_to_server(encode(Map.put(msg, "id", gid)), state)
        %{state | next_gid: gid + 1, pending: Map.put(state.pending, gid, {consumer, oid})}

      _ ->
        state
    end
  end

  # ---- detach / shutdown ------------------------------------------

  defp detach_consumer(consumer, state) do
    case Map.pop(state.consumers, consumer) do
      {nil, _} ->
        state

      {%{mon: mon}, rest} ->
        Process.demonitor(mon, [:flush])
        # who is an editor is read before it goes from the consumers
        {actions, owners} = LspOwners.leave(state.owners, consumer, editor_fn(state))
        state = run_owner_actions(actions, nil, %{state | consumers: rest, owners: owners})

        pending =
          state.pending |> Enum.reject(fn {_g, {cp, _o}} -> cp == consumer end) |> Map.new()

        pci = Enum.reject(state.pending_consumer_init, fn {cp, _o} -> cp == consumer end)
        state = %{state | pending: pending, pending_consumer_init: pci}

        if map_size(state.consumers) == 0, do: arm_grace(state), else: state
    end
  end

  defp arm_grace(state) do
    state = cancel_grace(state)
    %{state | grace_timer: Process.send_after(self(), :grace_shutdown, @grace_ms)}
  end

  defp cancel_grace(%{grace_timer: nil} = state), do: state

  defp cancel_grace(%{grace_timer: ref} = state) do
    Process.cancel_timer(ref)
    %{state | grace_timer: nil}
  end

  defp do_shutdown(%{ospid: nil}), do: :ok

  defp do_shutdown(state) do
    send_to_server(encode(%{"jsonrpc" => "2.0", "method" => "exit"}), state)

    try do
      _ = :exec.stop(state.ospid)
    catch
      _, _ -> :ok
    end

    :ok
  end

  # ---- wire helpers -------------------------------------------------

  # `text` is always a bare JSON string; LspFraming.encode adds the
  # Content-Length prefix. Framing lives in exactly one place.
  defp send_to_server(_text, %{ospid: nil}), do: :ok

  defp send_to_server(text, %{ospid: ospid}) when is_binary(text) do
    :exec.send(ospid, IO.iodata_to_binary(LspFraming.encode(text)))
  end

  defp broadcast(text, state) do
    for c <- Map.keys(state.consumers), do: send(c, {:lsp_out, text})
    :ok
  end

  defp reply_to_consumer(pid, map), do: send(pid, {:lsp_out, encode(map)})

  defp encode(map), do: IO.iodata_to_binary(:json.encode(map))

  defp decode(text) do
    {:ok, :json.decode(text)}
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end

  defp exit_code(:normal), do: 0

  defp exit_code({:exit_status, s}) when is_integer(s) do
    case :exec.status(s) do
      {:status, code} -> code
      {:signal, sig, _core} when is_integer(sig) -> 128 + sig
      {:signal, _sig, _core} -> 143
      _ -> -1
    end
  end

  defp exit_code(_), do: -1
end
