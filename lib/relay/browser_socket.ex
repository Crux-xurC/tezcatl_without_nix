defmodule BrowserSocket do
  @behaviour :cowboy_websocket
  require Logger

  @impl true
  def init(req, _opts) do
    case AllowedOrigins.check(:cowboy_req.header("origin", req, :undefined)) do
      :ok ->
        qs = :cowboy_req.parse_qs(req)
        {:cowboy_websocket, req, %{id: qval(qs, "id"), name: qval(qs, "name")},
         %{idle_timeout: :infinity}}

      {:error, origin} ->
        Logger.info("browser: rejecting handshake, disallowed Origin #{inspect(origin)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
        {:ok, req, %{id: nil, name: nil}}
    end
  end

  defp qval(qs, key) do
    case List.keyfind(qs, key, 0) do
      {_k, v} when is_binary(v) and v != "" -> v
      _ -> nil
    end
  end

  @impl true
  def websocket_init(state) do
    VentUplink.register(self(), state.id, state.name)
    {:ok, state}
  end

  @impl true
  def websocket_handle({:text, frame}, state) do
    VentUplink.to_emacs(frame)
    {:ok, state}
  end

  def websocket_handle(_frame, state), do: {:ok, state}

  @impl true
  def websocket_info({:vent, frame}, state), do: {:reply, {:text, frame}, state}

  def websocket_info(:evict, state), do: {:reply, {:close, 4000, "evicted"}, state}

  def websocket_info(_msg, state), do: {:ok, state}

  @impl true
  def terminate(_reason, _req, _state) do
    VentUplink.unregister(self())
    :ok
  end
end
