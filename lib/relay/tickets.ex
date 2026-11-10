defmodule Tickets do
  # One-shot tickets for WebSocket handshakes (D-poca-secret). A browser's
  # WebSocket cannot carry Poca's X-Poca-Secret header, so a page first asks
  # `GET /ticket` over HTTP (that request carries the header; SecretGate
  # checks it) and puts the ticket in the WebSocket URL. A ticket is good for
  # one handshake within the TTL (10 s); the secret itself never goes into a
  # URL. Kept in memory only (a public ETS table), thrown away at restart.

  use GenServer

  @table :tezcatl_tickets
  @default_ttl_ms 10_000

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @doc "A new ticket (32 url-safe characters)."
  def issue, do: GenServer.call(__MODULE__, :issue)

  @doc "true once for a live ticket; it is gone after that."
  def take(ticket) when is_binary(ticket) and ticket != "" do
    case :ets.take(@table, ticket) do
      [{_, deadline}] -> deadline > now()
      _ -> false
    end
  end

  def take(_), do: false

  @impl true
  def init(opts) do
    :ets.new(@table, [:named_table, :public, :set])
    ttl = Keyword.get(opts, :ttl_ms, @default_ttl_ms)
    schedule_sweep(ttl)
    {:ok, %{ttl: ttl}}
  end

  @impl true
  def handle_call(:issue, _from, %{ttl: ttl} = st) do
    ticket = :crypto.strong_rand_bytes(24) |> Base.url_encode64(padding: false)
    :ets.insert(@table, {ticket, now() + ttl})
    {:reply, ticket, st}
  end

  # Tickets nobody used: dropped every TTL so the table stays small.
  @impl true
  def handle_info(:sweep, %{ttl: ttl} = st) do
    t = now()
    :ets.select_delete(@table, [{{:_, :"$1"}, [{:"=<", :"$1", t}], [true]}])
    schedule_sweep(ttl)
    {:noreply, st}
  end

  defp schedule_sweep(ttl), do: Process.send_after(self(), :sweep, ttl)

  defp now, do: System.monotonic_time(:millisecond)
end
