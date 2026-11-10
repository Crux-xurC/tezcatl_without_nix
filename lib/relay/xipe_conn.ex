defmodule XipeConn do
  # One GenServer per xipe.json entry (its key, a name). Owns the single upstream WebSocket connection to
  # a Xipe Totec server (`xipe serve`) -- either spawning it first
  # (`:exec.run`, like LspServer's OS-process ownership) or connecting to one
  # already running (`:gun`, like VentUplink's client role), then behaving
  # exactly like VentUplink from there: broadcast every incoming frame to
  # every attached consumer, forward every consumer frame upstream verbatim.
  #
  # Deliberately NOT LspServer-shaped beyond the OS-process/lifecycle parts:
  # `/xipe` is required to be a stateless broadcast relay (no id
  # rewriting, no pending map, no init caching, no refcounting) -- xipe_totec
  # sends `notify/*` for state changes, so every consumer just sees the same
  # stream and reconciles a request id it recognises as its own.
  #
  # Lifecycle mirrors LspServer's grace-timer shape: starts on first attach
  # (via XipeRegistry), stops itself `@grace_ms` after the last consumer
  # detaches. If spawned, the OS process is stopped in terminate/2.

  use GenServer
  require Logger

  @grace_ms 45_000
  @connect_retry_ms 500
  # :connect mode only: a waiting attach is answered with an error after this
  # many failed attempts in a row (~3s) instead of sitting out attach/2's 20s
  # timeout. Retrying goes on, so a server started later is still picked up.
  # (:spawn mode keeps waiting: a booting server is expected to take a while,
  # and its exit is reported by the OS-process :DOWN.)
  @connect_give_up_after 6

  def child_spec(spec) do
    %{id: __MODULE__, start: {__MODULE__, :start_link, [spec]}, restart: :temporary}
  end

  @doc "spec = %{key: <xipe.json key>, project: XipeConfig project map}"
  def start_link(spec), do: GenServer.start_link(__MODULE__, spec)

  # Long timeout: this may wait out the spawn+connect race (see
  # handle_call({:attach, ...}) -- the reply is deliberately held until the
  # upstream connection is actually `up`, not just started, so a consumer's
  # first request right after `attached` is never silently dropped.
  def attach(pid, consumer), do: GenServer.call(pid, {:attach, consumer}, 20_000)
  def detach(pid, consumer), do: GenServer.cast(pid, {:detach, consumer})
  def from_consumer(pid, text), do: GenServer.cast(pid, {:msg, text})
  def info(pid), do: GenServer.call(pid, :info)
  def stop(pid), do: GenServer.call(pid, :stop)

  # ---- init --------------------------------------------------------------

  @impl true
  def init(%{key: key, project: project}) do
    case Application.ensure_all_started(:gun) do
      {:ok, _} -> :ok
      {:error, r} -> raise "gun failed to start: #{inspect(r)}"
    end

    state = %{
      key: key,
      project: project,
      ospid: nil,
      gun: nil,
      ref: nil,
      up: false,
      ever_up: false,
      consumers: %{},
      pending_attaches: [],
      grace_timer: nil,
      last_stderr: nil,
      connect_failures: 0
    }

    case project.mode do
      :spawn -> {:ok, state, {:continue, :spawn_then_connect}}
      :connect -> {:ok, state, {:continue, :connect}}
    end
  end

  @impl true
  def handle_continue(:spawn_then_connect, state) do
    name = state.key
    project = state.project

    case Application.ensure_all_started(:erlexec) do
      {:ok, _} -> :ok
      {:error, r} -> raise "erlexec failed to start: #{inspect(r)}"
    end

    with {:ok, prefix} <- XipeConfig.resolve_command(project) do
      # same defaults main.exs / LspSocket use for the relay's port and file root
      relay = %{
        port: System.get_env("TEZCATL_RELAY_PORT") || "4100",
        fs_root: System.get_env("TEZCATL_FS_ROOT") || File.cwd!()
      }

      argv = prefix ++ Enum.map(XipeConfig.spawn_args(project, relay), &String.to_charlist/1)
      install_dir = Path.expand(project.install_dir)
      opts = [:stdout, :stderr, :monitor, {:cd, String.to_charlist(install_dir)}]

      case :exec.run(argv, opts) do
        {:ok, _pid, ospid} ->
          Logger.info("xipe[#{name}]: spawned #{inspect(argv)} pid=#{ospid} cd=#{install_dir}")
          # `xipe serve` needs real startup time (Book load off disk, cowboy
          # bind) with no fixed bound, and `:gun.open/3` returns `{:ok, _}`
          # as soon as it starts trying -- it doesn't block for the TCP
          # handshake -- so a single attempt made right after spawn will
          # almost always race the listener and lose. Route through the
          # same do_connect/drop_gun retry loop as :connect mode instead of
          # polling separately; `ever_up` (false here) is what lets drop_gun
          # keep retrying through that startup race (see drop_gun).
          {:noreply, do_connect(%{state | ospid: ospid, ever_up: false})}

        {:error, reason} ->
          Logger.warning("xipe[#{name}]: exec.run failed: #{inspect(reason)}")
          {:stop, {:spawn_failed, reason}, state}
      end
    else
      {:error, reason} ->
        Logger.warning("xipe[#{name}]: #{reason}")
        {:stop, {:spawn_failed, reason}, state}
    end
  end

  def handle_continue(:connect, state), do: {:noreply, do_connect(state)}

  defp do_connect(state) do
    if state.gun, do: safe_close(state.gun)
    {host, port} = connect_target(state.project)

    case :gun.open(host, port, %{protocols: [:http], retry: 0}) do
      {:ok, gun} ->
        Process.monitor(gun)
        %{state | gun: gun, ref: nil, up: false}

      {:error, reason} ->
        name = state.key
        Logger.warning("xipe[#{name}]: gun.open failed (#{inspect(reason)}); retry in #{@connect_retry_ms}ms")
        Process.send_after(self(), :reconnect, @connect_retry_ms)
        count_failure(%{state | gun: nil, ref: nil, up: false})
    end
  end

  defp count_failure(%{project: %{mode: :connect}} = state) do
    n = state.connect_failures + 1

    if n >= @connect_give_up_after and state.pending_attaches != [] do
      {host, port} = connect_target(state.project)
      why = "cannot reach xipe at #{host}:#{port} (xipe.json mode \"connect\" -- is `xipe start` running there?)"
      for {from, _consumer} <- state.pending_attaches, do: GenServer.reply(from, {:error, why})
      %{state | connect_failures: 0, pending_attaches: []}
    else
      %{state | connect_failures: n}
    end
  end

  defp count_failure(state), do: state

  defp connect_target(%{mode: :spawn, port: port}), do: {~c"127.0.0.1", port}
  defp connect_target(%{mode: :connect, host: host, port: port}), do: {String.to_charlist(host), port}

  defp safe_close(gun) do
    try do
      :gun.close(gun)
    catch
      _, _ -> :ok
    end
  end

  # A spawned server that drops *after* being up once is treated as fatal --
  # the OS-process :DOWN handler is what actually stops this GenServer in
  # that case (respawning here too could double-append to book.jsonl if the
  # old process wasn't really dead). Before the first success (`ever_up`
  # false), a drop just means "still booting" and must keep retrying, same
  # as :connect mode retrying against a peer that isn't up yet.
  defp drop_gun(state) do
    if state.gun, do: safe_close(state.gun)
    give_up = state.project.mode == :spawn and state.ever_up
    unless give_up, do: Process.send_after(self(), :reconnect, @connect_retry_ms)
    count_failure(%{state | gun: nil, ref: nil, up: false})
  end

  @impl true
  def handle_info(:reconnect, %{gun: nil} = state), do: {:noreply, do_connect(state)}
  def handle_info(:reconnect, state), do: {:noreply, state}

  def handle_info({:gun_up, gun, _proto}, %{gun: gun} = state) do
    ref = :gun.ws_upgrade(gun, "/")
    {:noreply, %{state | ref: ref}}
  end

  def handle_info({:gun_upgrade, gun, ref, _protocols, _headers}, %{gun: gun, ref: ref} = state) do
    name = state.key
    Logger.info("xipe[#{name}]: connected to xipe serve")

    for {from, _consumer} <- state.pending_attaches, do: GenServer.reply(from, {:ok, %{name: name}})

    # A consumer attached before this upgrade (not one waiting above) was
    # talking to an upstream connection that is gone -- Xipe Totec was
    # restarted, or the link dropped -- and this new one is not
    # `initialize`d (Serve.Socket keeps that per connection). Tell it to
    # attach again, the same `attached` it got the first time, so it
    # re-initializes; the relay itself still caches nothing.
    waiting = MapSet.new(state.pending_attaches, fn {_from, consumer} -> consumer end)

    for pid <- Map.keys(state.consumers), not MapSet.member?(waiting, pid),
        do: send(pid, {:xipe_reattached, name})

    {:noreply, %{state | up: true, ever_up: true, pending_attaches: [], connect_failures: 0}}
  end

  def handle_info({:gun_ws, gun, ref, {:text, frame}}, %{gun: gun, ref: ref} = state) do
    for pid <- Map.keys(state.consumers), do: send(pid, {:xipe_out, frame})
    {:noreply, state}
  end

  def handle_info({:gun_ws, gun, ref, {:close, _code, _reason}}, %{gun: gun, ref: ref} = state),
    do: {:noreply, drop_gun(state)}

  def handle_info({:gun_ws, gun, _ref, :close}, %{gun: gun} = state), do: {:noreply, drop_gun(state)}

  def handle_info({:gun_down, gun, _proto, _reason, _killed}, %{gun: gun} = state),
    do: {:noreply, drop_gun(state)}

  def handle_info({:gun_error, gun, _ref, reason}, %{gun: gun} = state) do
    name = state.key
    Logger.warning("xipe[#{name}]: gun error (#{inspect(reason)})")
    {:noreply, drop_gun(state)}
  end

  # what the spawned xipe prints -- its startup line, and above all why it
  # quit (no project selected, port in use, ...), which would otherwise
  # reach a consumer only as "exited before connecting"
  def handle_info({stream, ospid, data}, %{ospid: ospid} = state) when stream in [:stdout, :stderr] do
    name = state.key

    lines = String.split(data, "\n", trim: true)

    for line <- lines do
      if stream == :stderr,
        do: Logger.warning("xipe[#{name}]: #{line}"),
        else: Logger.info("xipe[#{name}]: #{line}")
    end

    state = if stream == :stderr and lines != [], do: %{state | last_stderr: List.last(lines)}, else: state
    {:noreply, state}
  end

  def handle_info({:DOWN, _mon, :process, gun, _reason}, %{gun: gun} = state),
    do: {:noreply, drop_gun(state)}

  def handle_info({:DOWN, ospid, :process, _pid, reason}, %{ospid: ospid} = state)
      when is_integer(ospid) do
    name = state.key
    Logger.info("xipe[#{name}]: spawned process #{ospid} exited (#{inspect(reason)})")
    for pid <- Map.keys(state.consumers), do: send(pid, {:xipe_exit, reason})

    why = state.last_stderr || inspect(reason)

    for {from, _consumer} <- state.pending_attaches,
        do: GenServer.reply(from, {:error, "xipe serve exited before connecting: #{why}"})

    {:stop, :normal, %{state | ospid: nil, pending_attaches: []}}
  end

  def handle_info({:DOWN, mon, :process, consumer, _reason}, state) when is_reference(mon) do
    if Map.has_key?(state.consumers, consumer) do
      {:noreply, detach_consumer(consumer, state)}
    else
      {:noreply, state}
    end
  end

  def handle_info(:grace_shutdown, state) do
    if map_size(state.consumers) == 0 do
      name = state.key
      Logger.info("xipe[#{name}]: no consumers, shutting down")
      {:stop, :normal, %{state | grace_timer: nil}}
    else
      {:noreply, %{state | grace_timer: nil}}
    end
  end

  def handle_info(_other, state), do: {:noreply, state}

  # ---- calls/casts ---------------------------------------------------

  @impl true
  def handle_call({:attach, consumer}, from, state) do
    state =
      if Map.has_key?(state.consumers, consumer) do
        state
      else
        mon = Process.monitor(consumer)
        put_in(state.consumers[consumer], mon)
      end

    state = cancel_grace(state)

    if state.up do
      name = state.key
      {:reply, {:ok, %{name: name}}, state}
    else
      {:noreply, %{state | pending_attaches: [{from, consumer} | state.pending_attaches]}}
    end
  end

  def handle_call(:info, _from, state) do
    {:reply, %{key: state.key, up: state.up, ospid: state.ospid, consumers: map_size(state.consumers)},
     state}
  end

  def handle_call(:stop, _from, state) do
    {:stop, :normal, :ok, state}
  end

  @impl true
  def handle_cast({:detach, consumer}, state), do: {:noreply, detach_consumer(consumer, state)}

  def handle_cast({:msg, text}, %{gun: gun, ref: ref, up: true} = state) when is_pid(gun) do
    :gun.ws_send(gun, ref, {:text, text})
    {:noreply, state}
  end

  def handle_cast({:msg, _text}, state), do: {:noreply, state}

  # ---- lifecycle -------------------------------------------------------

  defp detach_consumer(consumer, state) do
    case Map.pop(state.consumers, consumer) do
      {nil, _} ->
        state

      {mon, rest} ->
        Process.demonitor(mon, [:flush])
        state = %{state | consumers: rest}
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

  @impl true
  def terminate(_reason, %{ospid: nil}), do: :ok

  def terminate(_reason, %{ospid: ospid}) do
    try do
      _ = :exec.stop(ospid)
    catch
      _, _ -> :ok
    end

    :ok
  end
end
