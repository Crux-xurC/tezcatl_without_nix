defmodule LspSocket do
  # /lsp -- one WebSocket per browser consumer (the code editor
  # holds it; purpose panels proxy through the editor over panel-bus).
  #
  # First frame from the client: {"kind":"attach","path":"<repo-relative>","lang":"<id>"}
  # (+ "client":"editor" from code-editor.js: lsp.json's "editor" server, if any).
  # The relay resolves the project root, picks the server from lsp.json, attaches
  # (starting the shared server if needed) and replies
  #   {"kind":"attached","rootUri":"file://<root>","serverId":"<id>","key":"<its key in /lsp/servers>","uri":"file://<path>"}
  # (both percent-encoded, LspServer.file_uri/1)
  # After that every text frame is a raw JSON-RPC message relayed to/from the
  # shared LspServer -- but for two the relay says itself (LspOwners, D-lsp-owner):
  #   {"kind":"held","uri":...}      the document is owned by another consumer:
  #                                  this one gets nothing about it
  #   {"kind":"released","uri":...}  its owner closed it: open it again (didOpen)
  #                                  to own it
  # Before "attached", to the code editor ("client":"editor") only, about the
  # project's environment the server starts with (D-project-env, ProjectEnv):
  #   {"kind":"env","state":"fetching","root":...,"marker":...}   asked for the first time
  #   {"kind":"env","state":"failed","root":...,"reason":...}     the relay's own is used

  @behaviour :cowboy_websocket
  require Logger

  @impl true
  def init(req, _opts) do
    case AllowedOrigins.check(:cowboy_req.header("origin", req, :undefined)) do
      :ok ->
        {:cowboy_websocket, req, %{server: nil, mon: nil, pending: nil}, %{idle_timeout: :infinity}}

      {:error, origin} ->
        Logger.info("lsp: rejecting handshake, disallowed Origin #{inspect(origin)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
        {:ok, req, %{server: nil, mon: nil, pending: nil}}
    end
  end

  @impl true
  def websocket_init(state), do: {:ok, state}

  @impl true
  # waiting for the project's environment: nothing goes anywhere yet
  def websocket_handle({:text, _frame}, %{server: nil, pending: {_, _}} = state), do: {:ok, state}

  def websocket_handle({:text, frame}, %{server: nil} = state) do
    case decode(frame) do
      {:ok, %{"kind" => "attach"} = msg} -> do_attach(msg, state)
      _ -> {:reply, {:text, err("send an attach message first")}, state}
    end
  end

  def websocket_handle({:text, frame}, %{server: pid} = state) when is_pid(pid) do
    LspServer.from_consumer(pid, self(), frame)
    {:ok, state}
  end

  def websocket_handle(_frame, state), do: {:ok, state}

  @impl true
  def websocket_info({:lsp_out, text}, state), do: {:reply, {:text, text}, state}

  def websocket_info({:lsp_held, uri}, state),
    do: {:reply, {:text, IO.iodata_to_binary(:json.encode(%{"kind" => "held", "uri" => uri}))}, state}

  def websocket_info({:lsp_released, uri}, state),
    do: {:reply, {:text, IO.iodata_to_binary(:json.encode(%{"kind" => "released", "uri" => uri}))}, state}

  def websocket_info({:project_env, key, result}, %{pending: {key, ctx}} = state),
    do: finish_attach(ctx, result, [], %{state | pending: nil})

  def websocket_info({:lsp_exit, code}, state) do
    {:reply, [{:text, ~s({"kind":"exit","code":#{code}})}, {:close, 1000, "lsp exited"}], state}
  end

  def websocket_info({:DOWN, mon, :process, _pid, _reason}, %{mon: mon} = state) do
    {:reply, [{:text, ~s({"kind":"exit","code":-1})}, {:close, 1000, "lsp gone"}],
     %{state | server: nil, mon: nil}}
  end

  def websocket_info(_msg, state), do: {:ok, state}

  @impl true
  def terminate(_reason, _req, %{server: pid}) when is_pid(pid) do
    LspServer.detach(pid, self())
    :ok
  end

  def terminate(_reason, _req, _state), do: :ok

  # ---- attach ----------------------------------------------------------

  defp do_attach(%{"path" => path, "lang" => lang} = msg, state)
       when is_binary(path) and is_binary(lang) do
    fs_root = System.get_env("TEZCATL_FS_ROOT") || File.cwd!()

    with {:ok, doc} <- read_lsp_json(),
         {:ok, cfg} <- LspConfig.normalize(doc),
         {:ok, server} <- server_for(cfg, lang, msg["client"]),
         {:ok, abs} <- FsValidate.resolve(fs_root, path) do
      root = LspConfig.find_root(abs, server.root_markers, fs_root)
      ctx = %{server: server, root: root, abs: abs, client: msg["client"]}

      # the project's environment, from the server's root up (D-project-env)
      case ProjectEnv.where(root) do
        :none ->
          finish_attach(ctx, nil, [], state)

        {:error, why} ->
          finish_attach(ctx, nil, env_frames(ctx, "failed", %{"root" => root, "reason" => why}), state)

        {:ok, w} ->
          case ProjectEnv.request(w.root, w.entry, w.timeout_ms) do
            {:ok, r} ->
              finish_attach(ctx, r, [], state)

            :pending ->
              frames = env_frames(ctx, "fetching", %{"root" => w.root, "marker" => w.entry.marker})
              {:reply, Enum.map(frames, &{:text, &1}), %{state | pending: {{w.root, w.entry.marker}, ctx}}}
          end
      end
    else
      {:error, reason} ->
        {:reply, [{:text, err(reason)}, {:close, 1000, "attach failed"}], state}
    end
  end

  # `result`: the project's environment (nil: the relay's own); a failed one
  # is said and the relay's own is used
  defp finish_attach(ctx, result, frames, state) do
    frames =
      case result do
        %{ok: false} = r -> frames ++ env_frames(ctx, "failed", %{"root" => r.root, "reason" => r.reason})
        _ -> frames
      end

    {env, path} = ProjectEnv.exec_of(result)

    with {:ok, argv} <- LspConfig.resolve_command(ctx.server, path) do
      spec = %{argv: argv, root: ctx.root, init_options: ctx.server.init_options, env: env}

      case attach_server({ctx.root, ctx.server.id}, spec, 2, ctx.client) do
        {:ok, pid, mon, meta} ->
          body =
            IO.iodata_to_binary(
              :json.encode(%{
                "kind" => "attached",
                "rootUri" => meta.root_uri,
                "serverId" => meta.server_id,
                # which server of GET /lsp/servers this is (DELETE /lsp/servers/:key stops it)
                "key" => LspRegistry.encode_key({ctx.root, ctx.server.id}),
                "uri" => LspServer.file_uri(ctx.abs)
              })
            )

          {:reply, Enum.map(frames, &{:text, &1}) ++ [{:text, body}], %{state | server: pid, mon: mon}}

        {:error, reason} ->
          {:reply, Enum.map(frames, &{:text, &1}) ++ [{:text, err(reason)}, {:close, 1000, "attach failed"}], state}
      end
    else
      {:error, reason} ->
        {:reply, Enum.map(frames, &{:text, &1}) ++ [{:text, err(reason)}, {:close, 1000, "attach failed"}], state}
    end
  end

  # only the code editor hears of it (Xipe Totec's scanner waits for "attached" alone)
  defp env_frames(%{client: "editor"}, st, fields),
    do: [IO.iodata_to_binary(:json.encode(Map.merge(%{"kind" => "env", "state" => st}, fields)))]

  defp env_frames(_ctx, _st, _fields), do: []

  defp do_attach(_msg, state) do
    {:reply, [{:text, err(~s(attach needs string "path" and "lang"))}, {:close, 1000, "bad attach"}],
     state}
  end

  # The registry hands back a live server, but it can stop before our attach
  # call reaches it (its grace period ran out, DELETE /lsp/servers, the
  # process exited). The call would then exit this socket process with no word
  # to the browser; ask the registry again instead (it starts a new one), and
  # give up with an error after `tries`.
  @doc false
  def attach_server(key, spec, tries, client \\ nil) do
    case LspRegistry.attach_or_start(key, spec, self()) do
      {:ok, pid} ->
        mon = Process.monitor(pid)

        case try_attach(pid, client) do
          {:ok, meta} ->
            {:ok, pid, mon, meta}

          :gone ->
            Process.demonitor(mon, [:flush])

            if tries > 1,
              do: attach_server(key, spec, tries - 1, client),
              else: {:error, "language server stopped while attaching"}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp try_attach(pid, client) do
    LspServer.attach(pid, self(), client)
  catch
    :exit, _ -> :gone
  end

  defp server_for(cfg, lang, client) do
    case LspConfig.server_for(cfg, lang, client) do
      {:ok, s} -> {:ok, s}
      :error -> {:error, "no LSP server configured for language #{inspect(lang)} (lsp.json)"}
    end
  end

  defp read_lsp_json do
    path = Path.join(File.cwd!(), "lsp.json")

    case File.read(path) do
      {:ok, bytes} ->
        try do
          {:ok, :json.decode(bytes)}
        rescue
          _ -> {:error, "lsp.json is not valid JSON"}
        catch
          _, _ -> {:error, "lsp.json is not valid JSON"}
        end

      {:error, :enoent} ->
        {:error, "lsp.json not found at the relay root"}

      {:error, e} ->
        {:error, "lsp.json: #{inspect(e)}"}
    end
  end

  defp err(reason) do
    IO.iodata_to_binary(:json.encode(%{"kind" => "error", "reason" => IO.chardata_to_string(reason)}))
  end

  defp decode(text) do
    {:ok, :json.decode(text)}
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end
end
