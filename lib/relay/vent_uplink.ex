defmodule VentUplink do
  use GenServer
  require Logger

  @reconnect_ms 2_000

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  def register(pid, id, name), do: GenServer.cast(__MODULE__, {:register, pid, id, name})

  def unregister(pid), do: GenServer.cast(__MODULE__, {:unregister, pid})

  def list, do: GenServer.call(__MODULE__, :list)

  def evict(id) when is_binary(id) and id != "", do: GenServer.call(__MODULE__, {:evict, id})
  def evict(_), do: :not_found

  def alive?, do: GenServer.call(__MODULE__, :alive?)

  def to_emacs(text), do: GenServer.cast(__MODULE__, {:to_emacs, text})

  @impl true
  def init(%{host: host, port: port}) do
    state = %{
      host: String.to_charlist(host),
      port: port,
      gun: nil,
      ref: nil,
      up: false,
      clients: %{}
    }

    {:ok, state, {:continue, :connect}}
  end

  @impl true
  def handle_continue(:connect, state), do: {:noreply, connect(state)}

  defp connect(state) do
    if state.gun, do: safe_close(state.gun)

    case :gun.open(state.host, state.port, %{protocols: [:http], retry: 0}) do
      {:ok, gun} ->
        Process.monitor(gun)
        %{state | gun: gun, ref: nil, up: false}

      {:error, reason} ->
        Logger.warning("vent uplink: gun.open failed (#{inspect(reason)}); retry in #{@reconnect_ms}ms")
        Process.send_after(self(), :reconnect, @reconnect_ms)
        %{state | gun: nil, ref: nil, up: false}
    end
  end

  defp safe_close(gun) do
    try do
      :gun.close(gun)
    catch
      _, _ -> :ok
    end
  end

  defp drop_gun(state) do
    if state.gun, do: safe_close(state.gun)
    Process.send_after(self(), :reconnect, @reconnect_ms)
    %{state | gun: nil, ref: nil, up: false}
  end

  @impl true
  def handle_info(:reconnect, %{gun: nil} = state), do: {:noreply, connect(state)}
  def handle_info(:reconnect, state), do: {:noreply, state}

  def handle_info({:gun_up, gun, _proto}, %{gun: gun} = state) do
    ref = :gun.ws_upgrade(gun, "/")
    {:noreply, %{state | ref: ref}}
  end

  def handle_info({:gun_upgrade, gun, ref, _protocols, _headers}, %{gun: gun, ref: ref} = state) do
    Logger.info("vent uplink: connected to emacs-vent (#{state.host}:#{state.port})")
    {:noreply, %{state | up: true}}
  end

  def handle_info({:gun_ws, gun, ref, {:text, frame}}, %{gun: gun, ref: ref} = state) do
    for {pid, _meta} <- state.clients, do: send(pid, {:vent, frame})
    {:noreply, state}
  end

  def handle_info({:gun_ws, gun, ref, {:close, _code, _reason}}, %{gun: gun, ref: ref} = state) do
    Logger.info("vent uplink: emacs-vent closed the socket")
    {:noreply, drop_gun(state)}
  end

  def handle_info({:gun_ws, gun, _ref, :close}, %{gun: gun} = state) do
    {:noreply, drop_gun(state)}
  end

  def handle_info({:gun_down, gun, _proto, _reason, _killed}, %{gun: gun} = state) do
    {:noreply, drop_gun(state)}
  end

  def handle_info({:gun_error, gun, _ref, reason}, %{gun: gun} = state) do
    Logger.warning("vent uplink: gun error (#{inspect(reason)})")
    {:noreply, drop_gun(state)}
  end

  def handle_info({:DOWN, _mon, :process, gun, _reason}, %{gun: gun} = state) do
    {:noreply, drop_gun(state)}
  end

  def handle_info({:DOWN, _mon, :process, pid, _reason}, state) do
    {:noreply, %{state | clients: Map.delete(state.clients, pid)}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  @impl true
  def handle_cast({:register, pid, id, name}, state) do
    mon = Process.monitor(pid)
    meta = %{id: id, name: name, mon: mon}
    Logger.info("vent uplink: +browser #{inspect(name)} (#{map_size(state.clients) + 1} total)")
    {:noreply, %{state | clients: Map.put(state.clients, pid, meta)}}
  end

  def handle_cast({:unregister, pid}, state) do
    case Map.pop(state.clients, pid) do
      {%{mon: mon} = meta, rest} ->
        Process.demonitor(mon, [:flush])
        Logger.info("vent uplink: -browser #{inspect(meta.name)} (#{map_size(rest)} total)")
        {:noreply, %{state | clients: rest}}

      {nil, _} ->
        {:noreply, state}
    end
  end

  def handle_cast({:to_emacs, text}, %{gun: gun, ref: ref, up: true} = state) when is_pid(gun) do
    :gun.ws_send(gun, ref, {:text, text})
    {:noreply, state}
  end

  def handle_cast({:to_emacs, _text}, state) do
    {:noreply, state}
  end

  @impl true
  def handle_call(:list, _from, state) do
    entries =
      state.clients
      |> Map.values()
      |> Enum.map(fn %{id: id, name: name} -> %{id: id, name: name} end)

    {:reply, entries, state}
  end

  def handle_call(:alive?, _from, state), do: {:reply, state.up, state}

  def handle_call({:evict, id}, _from, state) do
    case Enum.find(state.clients, fn {_pid, m} -> m.id == id end) do
      {pid, %{name: name}} ->
        send(pid, :evict)
        Logger.info("vent uplink: evict #{inspect(name)} (id #{inspect(id)}) -- asked to close")
        {:reply, {:ok, name}, state}

      nil ->
        {:reply, :not_found, state}
    end
  end
end
