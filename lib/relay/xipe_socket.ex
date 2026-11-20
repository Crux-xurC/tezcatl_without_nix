defmodule XipeSocket do
  # /xipe -- one WebSocket per browser consumer, stateless broadcast relay to
  # a single shared XipeConn per {root_key, root}. Unlike
  # LspSocket there is no per-message decode/re-encode here: once attached,
  # every frame is forwarded verbatim in both directions -- xipe_totec's own
  # `Protocol` module already owns request/response/notify shape, and every
  # consumer sees the same broadcast stream and picks what it needs.
  #
  # First frame from the client: {"kind":"attach","root":"<xipe.json key>"}
  # ("root" is only the entry's name, not a path -- which project the server
  # has open is Xipe Totec's own choice; the client learns it from
  # `initialize`'s result). The relay attaches (spawning or connecting as
  # needed) and replies {"kind":"attached","name":"<xipe.json key>"}.
  # After that every text frame is a raw JSON-RPC message relayed to/from
  # the shared XipeConn. `attached` comes again whenever the upstream
  # reconnects (Xipe Totec restarted): the new connection is not initialized,
  # so the client sends `initialize` again.
  #
  # The same shape serves other JSON-RPC servers over a WebSocket (2026-11-16,
  # D-xipe-relay): main.exs mounts this module once more for each name in the
  # relay root's backends.json (`["<name>", ...]`, this machine's own; see
  # extra_backends/1), the route's opts naming the backend -- `[]` (Xipe
  # Totec, xipe.json) or `[backend: "<name>"]` (/<name>, <name>.json). Nothing
  # here or in XipeConn reads the frames, so another server needs only its
  # own config file. A backend
  # other than Xipe Totec is `connect` only (it is started outside, from
  # Poca's box; XipeConn's spawn passes Xipe Totec's own arguments), and its
  # connections are kept in XipeRegistry under `<backend>.json:<name>` so they
  # never share one with a xipe.json entry of the same name.

  @behaviour :cowboy_websocket
  require Logger

  @impl true
  def init(req, opts) do
    backend = Keyword.get(opts, :backend, "xipe")

    case AllowedOrigins.check(:cowboy_req.header("origin", req, :undefined)) do
      :ok ->
        {:cowboy_websocket, req, %{conn: nil, mon: nil, backend: backend}, %{idle_timeout: :infinity}}

      {:error, origin} ->
        Logger.info("#{backend}: rejecting handshake, disallowed Origin #{inspect(origin)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
        {:ok, req, %{conn: nil, mon: nil, backend: backend}}
    end
  end

  # first path segments the relay's own routes use: never a backend's name
  @reserved ~w(xipe pty windows fs env mirror juncture ids lsp sql ticket)

  @doc """
  The other backends to mount (D-xipe-relay): the names in `file` (a JSON
  list of strings at the relay root; none when it is missing or broken), each
  a lowercase word that is not one of the relay's own routes.
  """
  def extra_backends(file) do
    with {:ok, text} <- File.read(file),
         {:ok, names} when is_list(names) <- (try do {:ok, :json.decode(text)} rescue _ -> :error end) do
      names
      |> Enum.filter(&(is_binary(&1) and &1 =~ ~r/\A[a-z][a-z0-9_]{0,31}\z/ and &1 not in @reserved))
      |> Enum.uniq()
    else
      _ -> []
    end
  end

  @doc "the config file a backend's entries are read from (at the relay root)"
  def config_file(backend), do: backend <> ".json"

  @doc "the XipeRegistry key of a backend's entry: a xipe.json entry by its name, any other `<backend>.json:<name>`"
  def registry_key("xipe", name), do: name
  def registry_key(backend, name), do: config_file(backend) <> ":" <> name

  @doc "the name told to the browser (`attached`): the entry's name, without registry_key/2's prefix"
  def entry_name("xipe", key), do: key
  def entry_name(backend, key), do: String.replace_prefix(key, config_file(backend) <> ":", "")

  @doc "a backend other than Xipe Totec is connect only. :ok | {:error, reason}"
  def check_mode("xipe", _project), do: :ok
  def check_mode(_backend, %{mode: :connect}), do: :ok

  def check_mode(backend, _project),
    do: {:error, "#{config_file(backend)}: only \"connect\" entries (start the server outside, e.g. from Poca's box)"}

  @impl true
  def websocket_init(state), do: {:ok, state}

  @impl true
  def websocket_handle({:text, frame}, %{conn: nil} = state) do
    case decode(frame) do
      {:ok, %{"kind" => "attach"} = msg} -> do_attach(msg, state)
      _ -> {:reply, {:text, err("send an attach message first")}, state}
    end
  end

  def websocket_handle({:text, frame}, %{conn: pid} = state) when is_pid(pid) do
    XipeConn.from_consumer(pid, frame)
    {:ok, state}
  end

  def websocket_handle(_frame, state), do: {:ok, state}

  @impl true
  def websocket_info({:xipe_out, text}, state), do: {:reply, {:text, text}, state}

  # the upstream came back on a new connection (XipeConn's gun_upgrade):
  # `attached` again, so the client sends `initialize` again
  def websocket_info({:xipe_reattached, name}, state),
    do: {:reply, {:text, attached(entry_name(state.backend, name))}, state}

  def websocket_info({:xipe_exit, reason}, state) do
    {:reply,
     [
       {:text, ~s({"kind":"exit","reason":#{inspect(to_string(inspect(reason)))}})},
       {:close, 1000, "xipe exited"}
     ], state}
  end

  def websocket_info({:DOWN, mon, :process, _pid, _reason}, %{mon: mon} = state) do
    {:reply, [{:text, ~s({"kind":"exit","reason":"gone"})}, {:close, 1000, "xipe gone"}],
     %{state | conn: nil, mon: nil}}
  end

  def websocket_info(_msg, state), do: {:ok, state}

  @impl true
  def terminate(_reason, _req, %{conn: pid}) when is_pid(pid) do
    XipeConn.detach(pid, self())
    :ok
  end

  def terminate(_reason, _req, _state), do: :ok

  # ---- attach ----------------------------------------------------------

  defp do_attach(%{"root" => root_key}, state) when is_binary(root_key) do
    backend = state.backend

    with {:ok, doc} <- read_config(backend),
         {:ok, cfg} <- XipeConfig.normalize(doc),
         {:ok, project} <- project_for(cfg, backend, root_key),
         :ok <- check_mode(backend, project) do
      case XipeRegistry.attach_or_start(registry_key(backend, root_key), project, self()) do
        {:ok, pid} ->
          mon = Process.monitor(pid)

          # XipeConn.attach/2 deliberately blocks until the upstream
          # connection is actually up (not just started) -- see its
          # moduledoc -- so a request sent right after "attached" is never
          # silently dropped while `xipe serve` is still spawning.
          try do
            case XipeConn.attach(pid, self()) do
              {:ok, meta} ->
                {:reply, {:text, attached(entry_name(backend, meta.name))}, %{state | conn: pid, mon: mon}}

              {:error, reason} ->
                Process.demonitor(mon, [:flush])
                {:reply, [{:text, err(reason)}, {:close, 1000, "attach failed"}], state}
            end
          catch
            :exit, reason ->
              Process.demonitor(mon, [:flush])
              {:reply, [{:text, err(exit_reason(reason))}, {:close, 1000, "attach failed"}], state}
          end

        {:error, reason} ->
          {:reply, [{:text, err(reason)}, {:close, 1000, "attach failed"}], state}
      end
    else
      {:error, reason} ->
        {:reply, [{:text, err(reason)}, {:close, 1000, "attach failed"}], state}
    end
  end

  defp do_attach(_msg, state) do
    {:reply, [{:text, err(~s(attach needs string "root"))}, {:close, 1000, "bad attach"}], state}
  end

  defp project_for(cfg, backend, root_key) do
    case XipeConfig.project_for(cfg, root_key) do
      {:ok, p} -> {:ok, p}
      :error -> {:error, "no entry for #{inspect(root_key)} in #{config_file(backend)}"}
    end
  end

  defp read_config(backend) do
    file = config_file(backend)
    path = Path.join(File.cwd!(), file)

    case File.read(path) do
      {:ok, bytes} ->
        try do
          {:ok, :json.decode(bytes)}
        rescue
          _ -> {:error, "#{file} is not valid JSON"}
        catch
          _, _ -> {:error, "#{file} is not valid JSON"}
        end

      {:error, :enoent} ->
        {:error, "#{file} not found at the relay root"}

      {:error, e} ->
        {:error, "#{file}: #{inspect(e)}"}
    end
  end

  # XipeConn.attach/2's call exiting, in words (not the raw exit term)
  @doc false
  def exit_reason({:timeout, _}), do: "xipe did not come up within 20s (see the relay log for its output)"
  def exit_reason({:noproc, _}), do: "xipe connection is gone (it stopped while attaching) -- retry"
  def exit_reason({reason, _}) when is_atom(reason), do: "xipe connection failed: #{reason}"
  def exit_reason(reason), do: "xipe connection failed: #{inspect(reason)}"

  defp attached(name), do: IO.iodata_to_binary(:json.encode(%{"kind" => "attached", "name" => name}))

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
