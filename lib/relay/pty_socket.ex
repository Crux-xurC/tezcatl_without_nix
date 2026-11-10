defmodule PtySocket do
  @behaviour :cowboy_websocket
  require Logger

  @impl true
  def init(req, _opts) do
    case AllowedOrigins.check(:cowboy_req.header("origin", req, :undefined)) do
      :ok ->
        {:cowboy_websocket, req, %{ospid: nil, flow: nil, pending: nil}, %{idle_timeout: :infinity}}

      {:error, origin} ->
        Logger.info("pty: rejecting handshake, disallowed Origin #{inspect(origin)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
        {:ok, req, %{ospid: nil, flow: nil, pending: nil}}
    end
  end

  @impl true
  def websocket_init(state) do
    {:ok, flow} = PtyFlow.start_link(self())
    {:ok, %{state | flow: flow}}
  end

  @impl true
  def websocket_handle({:text, frame}, state) do
    case decode(frame) do
      {:ok, %{"kind" => "start"} = msg} ->
        handle_start(msg, state)

      {:ok, %{"kind" => "resize"} = msg} ->
        handle_resize(msg, state)

      {:ok, %{"kind" => kind}} ->
        Logger.info("pty: dropping control message of unknown kind #{inspect(kind)}")
        {:ok, state}

      {:ok, _no_kind} ->
        Logger.info("pty: dropping control message with no \"kind\"")
        {:ok, state}

      :error ->
        Logger.info("pty: dropping text frame that is not a JSON object")
        {:ok, state}
    end
  end

  def websocket_handle({:binary, data}, %{ospid: ospid} = state) when is_integer(ospid) do
    :exec.send(ospid, data)
    {:ok, state}
  end

  def websocket_handle({:binary, _data}, state), do: {:ok, state}

  def websocket_handle(_frame, state), do: {:ok, state}

  @impl true
  def websocket_info({:pty_out, chunk}, %{flow: flow} = state) when is_pid(flow) do
    PtyFlow.request(flow, self())
    {:reply, {:binary, chunk}, state}
  end

  def websocket_info({:DOWN, ospid, :process, _pid, reason}, %{ospid: ospid} = state) do
    code = exit_code(reason)
    Logger.info("pty: child #{ospid} exited (#{inspect(reason)}) -> code #{code}")

    {:reply,
     [{:text, ~s({"kind":"exit","code":#{code}})}, {:close, 1000, "pty exited"}],
     %{state | ospid: nil}}
  end

  # the project's environment has come (or failed): start the shell asked for
  def websocket_info({:project_env, key, result}, %{pending: {key, msg, at}} = state) do
    frames = if result.ok, do: [env_frame("ready", ProjectEnv.describe(result))], else: [env_frame("failed", ProjectEnv.describe(result))]
    start_with(msg, result, at, frames, %{state | pending: nil})
  end

  def websocket_info(_msg, state), do: {:ok, state}

  @impl true
  def terminate(_reason, _req, %{ospid: ospid} = state) when is_integer(ospid) do
    PtyFlow.stop(Map.get(state, :flow))
    try do
      _ = :exec.kill(ospid, 9)
      _ = :exec.stop(ospid)
    catch
      kind, reason ->
        Logger.warning("pty: teardown of #{ospid} raised #{kind} #{inspect(reason)}")
    end

    :ok
  end

  def terminate(_reason, _req, state) do
    PtyFlow.stop(Map.get(state || %{}, :flow))
    :ok
  end

  defp handle_start(_msg, %{ospid: ospid} = state) when is_integer(ospid) do
    Logger.info("pty: ignoring start, a PTY is already running (#{ospid})")
    {:ok, state}
  end

  defp handle_start(_msg, %{pending: {_, _, _}} = state) do
    Logger.info("pty: ignoring start, one is waiting for its project's environment")
    {:ok, state}
  end

  # "env": {"path": <from the FS root>} -- the project around that path: its
  # environment (D-project-env) and its root as the directory
  defp handle_start(%{"env" => %{"path" => path}} = msg, state) when is_binary(path) do
    fs_root = System.get_env("TEZCATL_FS_ROOT") || File.cwd!()

    with {:ok, abs} <- FsValidate.resolve(fs_root, path),
         true <- File.exists?(abs) || {:error, "#{path} does not exist"} do
      dir = if File.dir?(abs), do: abs, else: Path.dirname(abs)

      case ProjectEnv.where(dir) do
        :none ->
          note = %{"path" => path, "reason" => "no marker of project_env.json from #{path} up to the FS root"}
          start_with(msg, nil, dir, [env_frame("none", note)], state)

        {:error, why} ->
          start_with(msg, nil, dir, [env_frame("none", %{"path" => path, "reason" => why})], state)

        {:ok, w} ->
          case ProjectEnv.request(w.root, w.entry, w.timeout_ms) do
            {:ok, r} ->
              start_with(msg, r, w.root, [env_frame(if(r.ok, do: "ready", else: "failed"), ProjectEnv.describe(r))], state)

            :pending ->
              frame = env_frame("fetching", %{"root" => w.root, "marker" => w.entry.marker})
              {:reply, {:text, frame}, %{state | pending: {{w.root, w.entry.marker}, msg, w.root}}}
          end
      end
    else
      {:error, why} -> fail_start(why, state)
    end
  end

  defp handle_start(msg, state), do: start_with(msg, nil, nil, [], state)

  # result: the project's environment (nil, or failed: the relay's own); at: the
  # directory (nil: the message's "cwd"); frames: said before the shell's output
  defp start_with(msg, result, at, frames, state) do
    {env, path} = ProjectEnv.exec_of(result)
    cwd = if at, do: at, else: Map.get(msg, "cwd")

    with :ok <- ensure_exec(),
         {:ok, argv} <- PtyValidate.validate_cmd(Map.get(msg, "cmd"), if(result, do: path)),
         {:ok, rows, cols} <-
           PtyValidate.validate_size(Map.get(msg, "rows"), Map.get(msg, "cols")),
         {:ok, cd_opt} <- PtyValidate.validate_cwd(cwd) do
      opts =
        [
          :stdin,
          {:stdout, state.flow},
          {:stderr, state.flow},
          :pty,
          :pty_echo,
          :monitor,
          {:group, 0},
          :kill_group,
          {:kill_timeout, 2},
          {:winsz, {rows, cols}},
          {:env, env ++ [{~c"TERM", ~c"xterm-256color"}]}
        ] ++ cd_opt

      case :exec.run(argv, opts) do
        {:ok, _pid, ospid} ->
          Logger.info("pty: started #{inspect(argv)} pid=#{ospid} (#{cols}x#{rows})")
          PtyFlow.set_ospid(state.flow, ospid)
          PtyFlow.request(state.flow, self())
          reply_frames(frames, %{state | ospid: ospid})

        {:error, reason} ->
          fail_start("exec.run failed: #{inspect(reason)}", state)
      end
    else
      {:error, why} ->
        fail_start(why, state)
    end
  end

  defp reply_frames([], state), do: {:ok, state}
  defp reply_frames(frames, state), do: {:reply, Enum.map(frames, &{:text, &1}), state}

  defp env_frame(st, fields),
    do: IO.iodata_to_binary(:json.encode(Map.merge(%{"kind" => "env", "state" => st}, fields)))

  defp ensure_exec do
    case Application.ensure_all_started(:erlexec) do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, "erlexec failed to start: #{inspect(reason)}"}
    end
  end

  defp fail_start(why, state) do
    why = IO.chardata_to_string(why)
    Logger.info("pty: rejecting start (#{why})")
    body = IO.iodata_to_binary(:json.encode(%{"kind" => "error", "reason" => why}))
    {:reply, [{:text, body}, {:close, 1000, "start failed"}], state}
  end

  # the size changed while waiting for the environment: start with the new one
  defp handle_resize(msg, %{ospid: nil, pending: {key, start, at}} = state) do
    start = Map.merge(start, Map.take(msg, ["rows", "cols"]))
    {:ok, %{state | pending: {key, start, at}}}
  end

  defp handle_resize(_msg, %{ospid: nil} = state) do
    Logger.info("pty: ignoring resize, no PTY running")
    {:ok, state}
  end

  defp handle_resize(msg, %{ospid: ospid} = state) do
    case PtyValidate.validate_size(Map.get(msg, "rows"), Map.get(msg, "cols")) do
      {:ok, rows, cols} ->
        case :exec.winsz(ospid, rows, cols) do
          :ok -> :ok
          other -> Logger.warning("pty: winsz #{cols}x#{rows} failed: #{inspect(other)}")
        end

        {:ok, state}

      {:error, why} ->
        Logger.info("pty: rejecting resize (#{why})")
        {:ok, state}
    end
  end

  defp decode(frame) do
    case :json.decode(frame) do
      map when is_map(map) -> {:ok, map}
      _ -> :error
    end
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end

  defp exit_code(:normal), do: 0

  defp exit_code({:exit_status, status}) when is_integer(status) do
    case :exec.status(status) do
      {:status, code} -> code
      {:signal, sig, _core} -> 128 + sig_to_int(sig)
    end
  end

  defp exit_code(_), do: -1

  defp sig_to_int(sig) when is_integer(sig), do: sig

  defp sig_to_int(sig) when is_atom(sig) do
    :exec.signal_to_int(sig)
  rescue
    _ -> 15
  catch
    _, _ -> 15
  end

  defp sig_to_int(_), do: 15
end
