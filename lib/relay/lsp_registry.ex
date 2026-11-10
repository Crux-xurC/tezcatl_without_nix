defmodule LspRegistry do
  # Keeps one LspServer per {root, serverId}. Serialises start-up so two
  # near-simultaneous /lsp attaches for the same key share a server.
  # Children run under the DynamicSupervisor named Tezcatl.LspSup (started by
  # main.exs alongside this process).

  use GenServer
  require Logger

  @sup Tezcatl.LspSup

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc """
  Return the server pid for `{root, server_id}`, starting it if needed.
  `spec` = `%{argv: [charlist], root: String.t()}` (+ `env`: the project's, D-project-env).
  `{:ok, pid}` | `{:error, reason}`. A server already running keeps the env it started with.
  """
  def attach_or_start({root, server_id} = key, %{argv: argv, root: root} = spec, _consumer) do
    GenServer.call(
      __MODULE__,
      {:ensure, key,
       %{
         argv: argv,
         root: root,
         server_id: server_id,
         init_options: Map.get(spec, :init_options),
         env: Map.get(spec, :env, [])
       }},
      10_000
    )
  end

  @doc "List the running servers (each an LspServer.info/1 map + a url-safe `key`)."
  def list, do: GenServer.call(__MODULE__, :list)

  @doc "Stop the server for an encoded key (as returned by list/0). :ok | :not_found."
  def stop(key_enc) when is_binary(key_enc), do: GenServer.call(__MODULE__, {:stop, key_enc})

  def encode_key({root, server_id}),
    do: Base.url_encode64(root <> "\n" <> server_id, padding: false)

  def decode_key(enc) do
    with {:ok, raw} <- Base.url_decode64(enc, padding: false),
         [root, server_id] <- String.split(raw, "\n", parts: 2) do
      {:ok, {root, server_id}}
    else
      _ -> :error
    end
  end

  # ---- server ------------------------------------------------------

  @impl true
  def init(:ok), do: {:ok, %{servers: %{}}}

  @impl true
  def handle_call({:ensure, key, spec}, _from, state) do
    case Map.get(state.servers, key) do
      %{pid: pid} ->
        if Process.alive?(pid) do
          {:reply, {:ok, pid}, state}
        else
          start_and_track(key, spec, %{state | servers: Map.delete(state.servers, key)})
        end

      nil ->
        start_and_track(key, spec, state)
    end
  end

  def handle_call(:list, _from, state) do
    rows =
      for {key, %{pid: pid}} <- state.servers, Process.alive?(pid) do
        info =
          try do
            LspServer.info(pid)
          catch
            _, _ -> %{status: :unknown, consumers: 0, docs: 0, ospid: nil}
          end

        %{
          "key" => encode_key(key),
          "root" => elem(key, 0),
          "serverId" => elem(key, 1),
          "status" => to_string(info.status),
          "consumers" => info.consumers,
          "docs" => info.docs,
          "pid" => info.ospid || :null
        }
      end

    {:reply, rows, state}
  end

  def handle_call({:stop, key_enc}, _from, state) do
    with {:ok, key} <- decode_key(key_enc),
         %{pid: pid} <- Map.get(state.servers, key) do
      try do
        LspServer.stop(pid)
      catch
        _, _ -> :ok
      end

      {:reply, :ok, %{state | servers: Map.delete(state.servers, key)}}
    else
      _ -> {:reply, :not_found, state}
    end
  end

  @impl true
  def handle_info({:DOWN, mon, :process, _pid, _reason}, state) do
    servers =
      state.servers
      |> Enum.reject(fn {_k, %{mon: m}} -> m == mon end)
      |> Map.new()

    {:noreply, %{state | servers: servers}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  defp start_and_track(key, spec, state) do
    case DynamicSupervisor.start_child(@sup, {LspServer, spec}) do
      {:ok, pid} ->
        mon = Process.monitor(pid)
        {:reply, {:ok, pid}, put_in(state.servers[key], %{pid: pid, mon: mon})}

      {:error, reason} ->
        Logger.warning("lsp: could not start server for #{inspect(key)}: #{inspect(reason)}")
        {:reply, {:error, "could not start LSP server: #{inspect(reason)}"}, state}
    end
  end
end
