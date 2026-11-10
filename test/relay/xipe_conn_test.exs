
{:ok, _} = Application.ensure_all_started(:cowboy)
{:ok, _} = Application.ensure_all_started(:gun)

# A stand-in for `xipe serve`'s WebSocket (Serve.Socket): answers
# initialize, echoes `input` in dialogue.text, and on input "ping" also
# pushes a notify/* -- enough to exercise XipeConn's upstream side for real
# (gun over TCP), with no Xipe Totec checkout involved.
defmodule FakeXipeServer do
  @behaviour :cowboy_websocket

  def start(port \\ 0) do
    dispatch = :cowboy_router.compile([{:_, [{"/", __MODULE__, []}]}])
    ref = make_ref()
    {:ok, _} = :cowboy.start_clear(ref, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, port}]}, %{env: %{dispatch: dispatch}})
    {ref, :ranch.get_port(ref)}
  end

  def stop(ref), do: :cowboy.stop_listener(ref)

  @impl true
  def init(req, _), do: {:cowboy_websocket, req, %{}, %{idle_timeout: :infinity}}

  @impl true
  def websocket_handle({:text, frame}, state) do
    msg = :json.decode(frame)

    case msg do
      %{"method" => "initialize", "id" => id} ->
        {:reply, {:text, enc(%{"jsonrpc" => "2.0", "id" => id, "result" => %{"capabilities" => %{}, "project" => %{"id" => "001"}}})}, state}

      %{"method" => "input", "id" => id, "params" => %{"text" => text}} ->
        reply = enc(%{"jsonrpc" => "2.0", "id" => id, "result" => %{}, "from" => nil,
                      "dialogue" => %{"hold" => false, "via_repl" => false, "text" => "got " <> text}})
        frames = [{:text, reply}] ++
          if(text == "ping", do: [{:text, enc(%{"jsonrpc" => "2.0", "method" => "notify/rowChanged", "params" => %{"id" => "r1"}})}], else: [])
        {:reply, frames, state}

      _ ->
        {:ok, state}
    end
  end

  def websocket_handle(_, state), do: {:ok, state}

  @impl true
  def websocket_info(_, state), do: {:ok, state}

  defp enc(map), do: IO.iodata_to_binary(:json.encode(map))
end

defmodule XipeConnTest do
  use ExUnit.Case, async: false

  defp connect_spec(port), do: %{key: "t", project: %{mode: :connect, host: "127.0.0.1", port: port}}

  defp free_port do
    {:ok, s} = :gen_tcp.listen(0, [ip: {127, 0, 0, 1}])
    {:ok, p} = :inet.port(s)
    :gen_tcp.close(s)
    p
  end

  defp recv_json(timeout \\ 3000) do
    receive do
      {:xipe_out, frame} -> :json.decode(frame)
    after
      timeout -> flunk("no frame from XipeConn")
    end
  end

  test "attach waits for the upstream, then frames go up verbatim and every reply reaches every consumer" do
    {ref, port} = FakeXipeServer.start()
    on_exit(fn -> FakeXipeServer.stop(ref) end)
    {:ok, conn} = XipeConn.start_link(connect_spec(port))

    other = spawn_link(fn -> receive do: (:never -> :ok) end)
    assert {:ok, %{name: "t"}} = XipeConn.attach(conn, self())
    assert {:ok, _} = XipeConn.attach(conn, other)
    assert %{up: true, consumers: 2} = XipeConn.info(conn)

    XipeConn.from_consumer(conn, ~s({"jsonrpc":"2.0","id":"a-1","method":"initialize","params":{}}))
    assert %{"id" => "a-1", "result" => %{"project" => %{"id" => "001"}}} = recv_json()

    XipeConn.from_consumer(conn, ~s({"jsonrpc":"2.0","id":"a-2","method":"input","params":{"text":"ping"}}))
    assert %{"id" => "a-2", "dialogue" => %{"text" => "got ping"}} = recv_json()
    assert %{"method" => "notify/rowChanged", "params" => %{"id" => "r1"}} = recv_json()

    # the relay is stateless: the other consumer got the same frames
    assert {:messages, msgs} = Process.info(other, :messages)
    assert length(Enum.filter(msgs, &match?({:xipe_out, _}, &1))) == 3
  end

  test "connect mode: an unreachable server fails an attach in a few seconds, not attach/2's 20s" do
    port = free_port()
    {:ok, conn} = XipeConn.start_link(connect_spec(port))
    t0 = System.monotonic_time(:millisecond)
    assert {:error, why} = XipeConn.attach(conn, self())
    elapsed = System.monotonic_time(:millisecond) - t0
    assert why =~ "cannot reach xipe at 127.0.0.1:#{port}"
    assert elapsed < 8_000

    # retrying continues: a server started afterwards is picked up
    {ref, ^port} = FakeXipeServer.start(port)
    on_exit(fn -> FakeXipeServer.stop(ref) end)
    assert {:ok, %{name: "t"}} = XipeConn.attach(conn, self())
  end

  test "connect mode: when the server restarts, attached consumers are told to attach (and initialize) again" do
    {ref, port} = FakeXipeServer.start()
    {:ok, conn} = XipeConn.start_link(connect_spec(port))
    assert {:ok, %{name: "t"}} = XipeConn.attach(conn, self())

    # Xipe Totec restarted: the old upstream goes away, a new one comes up on the same port
    FakeXipeServer.stop(ref)
    {ref2, ^port} = FakeXipeServer.start(port)
    on_exit(fn -> FakeXipeServer.stop(ref2) end)

    assert_receive {:xipe_reattached, "t"}, 5_000
    assert %{up: true, consumers: 1} = XipeConn.info(conn)

    # the new connection works once the consumer re-initializes
    XipeConn.from_consumer(conn, ~s({"jsonrpc":"2.0","id":"b-1","method":"initialize","params":{}}))
    assert %{"id" => "b-1", "result" => %{"project" => %{"id" => "001"}}} = recv_json()

    # the first connect is not a re-attach
    refute_received {:xipe_reattached, _}
  end

  test "XipeSocket.exit_reason/1 words an attach exit instead of the raw term" do
    assert XipeSocket.exit_reason({:timeout, {GenServer, :call, [:x, :attach, 20_000]}}) =~ "within 20s"
    assert XipeSocket.exit_reason({:noproc, {GenServer, :call, []}}) =~ "retry"
    assert XipeSocket.exit_reason({:shutdown, {GenServer, :call, []}}) == "xipe connection failed: shutdown"
    assert XipeSocket.exit_reason(:weird) == "xipe connection failed: :weird"
  end
end
