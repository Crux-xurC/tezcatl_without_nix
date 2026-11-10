defmodule XipeRegistry do
  # Keeps one XipeConn per xipe.json entry (keyed by its name). Serialises start-up so two
  # near-simultaneous /xipe attaches for the same project share a connection.
  # Children run under the DynamicSupervisor named Tezcatl.XipeSup (started by
  # main.exs alongside this process). Mirrors LspRegistry exactly.

  use GenServer
  require Logger

  @sup Tezcatl.XipeSup

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc """
  Return the XipeConn pid for the xipe.json entry `key`, starting it if needed.
  `project` is a normalized `XipeConfig` project map. `{:ok, pid}` | `{:error, reason}`.
  """
  def attach_or_start(key, project, _consumer) do
    GenServer.call(__MODULE__, {:ensure, key, project}, 10_000)
  end

  @doc "List the running connections (each an XipeConn.info/1 map + a url-safe `key`)."
  def list, do: GenServer.call(__MODULE__, :list)

  @doc "Stop the connection for an encoded key (as returned by list/0). :ok | :not_found."
  def stop(key_enc) when is_binary(key_enc), do: GenServer.call(__MODULE__, {:stop, key_enc})

  def encode_key(name), do: Base.url_encode64(name, padding: false)

  def decode_key(enc) do
    case Base.url_decode64(enc, padding: false) do
      {:ok, name} -> {:ok, name}
      :error -> :error
    end
  end

  # ---- server ------------------------------------------------------

  @impl true
  def init(:ok), do: {:ok, %{conns: %{}}}

  @impl true
  def handle_call({:ensure, key, project}, _from, state) do
    case Map.get(state.conns, key) do
      %{pid: pid} ->
        if Process.alive?(pid) do
          {:reply, {:ok, pid}, state}
        else
          start_and_track(key, project, %{state | conns: Map.delete(state.conns, key)})
        end

      nil ->
        start_and_track(key, project, state)
    end
  end

  def handle_call(:list, _from, state) do
    rows =
      for {key, %{pid: pid}} <- state.conns, Process.alive?(pid) do
        info =
          try do
            XipeConn.info(pid)
          catch
            _, _ -> %{up: false, consumers: 0, ospid: nil}
          end

        %{
          "key" => encode_key(key),
          "name" => key,
          "up" => info.up,
          "consumers" => info.consumers,
          "pid" => info.ospid || :null
        }
      end

    {:reply, rows, state}
  end

  def handle_call({:stop, key_enc}, _from, state) do
    with {:ok, key} <- decode_key(key_enc),
         %{pid: pid} <- Map.get(state.conns, key) do
      try do
        XipeConn.stop(pid)
      catch
        _, _ -> :ok
      end

      {:reply, :ok, %{state | conns: Map.delete(state.conns, key)}}
    else
      _ -> {:reply, :not_found, state}
    end
  end

  @impl true
  def handle_info({:DOWN, mon, :process, _pid, _reason}, state) do
    conns =
      state.conns
      |> Enum.reject(fn {_k, %{mon: m}} -> m == mon end)
      |> Map.new()

    {:noreply, %{state | conns: conns}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  defp start_and_track(key, project, state) do
    case DynamicSupervisor.start_child(@sup, {XipeConn, %{key: key, project: project}}) do
      {:ok, pid} ->
        mon = Process.monitor(pid)
        {:reply, {:ok, pid}, put_in(state.conns[key], %{pid: pid, mon: mon})}

      {:error, reason} ->
        Logger.warning("xipe: could not start connection for #{inspect(key)}: #{inspect(reason)}")
        {:reply, {:error, "could not start Xipe Totec connection: #{inspect(reason)}"}, state}
    end
  end
end
