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

  @behaviour :cowboy_websocket
  require Logger

  @impl true
  def init(req, _opts) do
    case AllowedOrigins.check(:cowboy_req.header("origin", req, :undefined)) do
      :ok ->
        {:cowboy_websocket, req, %{conn: nil, mon: nil}, %{idle_timeout: :infinity}}

      {:error, origin} ->
        Logger.info("xipe: rejecting handshake, disallowed Origin #{inspect(origin)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
        {:ok, req, %{conn: nil, mon: nil}}
    end
  end

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
  def websocket_info({:xipe_reattached, name}, state), do: {:reply, {:text, attached(name)}, state}

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
    with {:ok, doc} <- read_xipe_json(),
         {:ok, cfg} <- XipeConfig.normalize(doc),
         {:ok, project} <- project_for(cfg, root_key) do
      case XipeRegistry.attach_or_start(root_key, project, self()) do
        {:ok, pid} ->
          mon = Process.monitor(pid)

          # XipeConn.attach/2 deliberately blocks until the upstream
          # connection is actually up (not just started) -- see its
          # moduledoc -- so a request sent right after "attached" is never
          # silently dropped while `xipe serve` is still spawning.
          try do
            case XipeConn.attach(pid, self()) do
              {:ok, meta} ->
                {:reply, {:text, attached(meta.name)}, %{state | conn: pid, mon: mon}}

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

  defp project_for(cfg, root_key) do
    case XipeConfig.project_for(cfg, root_key) do
      {:ok, p} -> {:ok, p}
      :error -> {:error, "no Xipe Totec project configured for #{inspect(root_key)} (xipe.json)"}
    end
  end

  defp read_xipe_json do
    path = Path.join(File.cwd!(), "xipe.json")

    case File.read(path) do
      {:ok, bytes} ->
        try do
          {:ok, :json.decode(bytes)}
        rescue
          _ -> {:error, "xipe.json is not valid JSON"}
        catch
          _, _ -> {:error, "xipe.json is not valid JSON"}
        end

      {:error, :enoent} ->
        {:error, "xipe.json not found at the relay root"}

      {:error, e} ->
        {:error, "xipe.json: #{inspect(e)}"}
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
