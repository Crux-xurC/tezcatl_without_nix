

defmodule SecretGateTest do
  use ExUnit.Case, async: false

  @secret "s3cret-0123456789abcdef"

  defmodule OkHandler do
    def init(req, state) do
      {:ok, :cowboy_req.reply(200, %{"content-type" => "text/plain"}, "ok", req), state}
    end
  end

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    {:ok, _} = Tickets.start_link()
    SecretGate.configure({:secret, @secret})

    dispatch =
      :cowboy_router.compile([
        {:_, [{"/fs/read", OkHandler, []}, {"/", OkHandler, []}, {"/ticket", TicketHandler, []}]}
      ])

    {:ok, _} =
      :cowboy.start_clear(
        :secret_gate_test,
        %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 0}]},
        %{env: %{dispatch: dispatch}, middlewares: [SecretGate, :cowboy_router, :cowboy_handler]}
      )

    on_exit(fn -> :cowboy.stop_listener(:secret_gate_test) end)
    %{port: :ranch.get_port(:secret_gate_test)}
  end

  defp info(fields) do
    Map.merge(
      %{method: "GET", websocket: false, origin: :undefined, header: :undefined, ticket: nil},
      Map.new(fields)
    )
  end

  defp never(_), do: false
  defp always(_), do: true

  describe "mode_from_env/0" do
    setup do
      prev = {System.get_env("POCA_SECRET"), System.get_env("TEZCATL_AUTH")}
      System.delete_env("POCA_SECRET")
      System.delete_env("TEZCATL_AUTH")

      on_exit(fn ->
        {s, a} = prev
        if s, do: System.put_env("POCA_SECRET", s), else: System.delete_env("POCA_SECRET")
        if a, do: System.put_env("TEZCATL_AUTH", a), else: System.delete_env("TEZCATL_AUTH")
      end)
    end

    test "nothing -> :missing (the relay will not start)" do
      assert SecretGate.mode_from_env() == :missing
    end

    test "TEZCATL_AUTH=off -> :off; any other value is not off" do
      System.put_env("TEZCATL_AUTH", "off")
      assert SecretGate.mode_from_env() == :off
      System.put_env("TEZCATL_AUTH", "no")
      assert SecretGate.mode_from_env() == :missing
    end

    test "a secret wins over off; an empty one is none" do
      System.put_env("TEZCATL_AUTH", "off")
      System.put_env("POCA_SECRET", @secret)
      assert SecretGate.mode_from_env() == {:secret, @secret}
      System.put_env("POCA_SECRET", "")
      assert SecretGate.mode_from_env() == :off
    end
  end

  describe "decide/3" do
    @mode {:secret, @secret}

    test "off lets everything through" do
      assert SecretGate.decide(:off, info([]), &never/1) == :ok
      assert SecretGate.decide(:off, info(websocket: true, origin: "http://evil"), &never/1) == :ok
    end

    test "HTTP needs the header, whatever the Origin" do
      assert SecretGate.decide(@mode, info(header: @secret), &never/1) == :ok
      assert {:deny, 401, _} = SecretGate.decide(@mode, info([]), &never/1)
      assert {:deny, 401, _} = SecretGate.decide(@mode, info(origin: "http://127.0.0.1:4001"), &never/1)
      assert {:deny, 401, _} = SecretGate.decide(@mode, info(header: "wrong"), &never/1)
      assert {:deny, 401, _} = SecretGate.decide(@mode, info(header: @secret <> "x"), &never/1)
      assert {:deny, 401, _} = SecretGate.decide(@mode, info(method: "POST", ticket: "t"), &always/1)
    end

    test "OPTIONS (a preflight) goes through" do
      assert SecretGate.decide(@mode, info(method: "OPTIONS", origin: "http://127.0.0.1:4001"), &never/1) == :ok
    end

    test "a WebSocket without Origin is not a browser: through" do
      assert SecretGate.decide(@mode, info(websocket: true), &never/1) == :ok
    end

    test "a browser's WebSocket needs a ticket (or the header)" do
      ws = [websocket: true, origin: "http://127.0.0.1:4001"]
      assert SecretGate.decide(@mode, info(ws ++ [ticket: "t"]), &always/1) == :ok
      assert SecretGate.decide(@mode, info(ws ++ [header: @secret]), &never/1) == :ok
      assert {:deny, 403, _} = SecretGate.decide(@mode, info(ws ++ [ticket: "t"]), &never/1)
      assert {:deny, 403, _} = SecretGate.decide(@mode, info(ws), &never/1)
    end
  end

  describe "Tickets" do
    test "a ticket is good once" do
      t = Tickets.issue()
      assert byte_size(t) == 32
      assert Tickets.take(t)
      refute Tickets.take(t)
    end

    test "made-up, empty and nil tickets are not" do
      refute Tickets.take("made-up")
      refute Tickets.take("")
      refute Tickets.take(nil)
    end

    test "a ticket expires" do
      :sys.replace_state(Tickets, fn st -> %{st | ttl: 50} end)
      t = Tickets.issue()
      Process.sleep(80)
      refute Tickets.take(t)
      :sys.replace_state(Tickets, fn st -> %{st | ttl: 10_000} end)
    end
  end

  describe "the middleware on a listener" do
    # raw HTTP: the request is exactly the lines given
    defp request(port, line, headers) do
      {:ok, s} = :gen_tcp.connect(~c"127.0.0.1", port, [:binary, active: false])
      hs = Enum.map_join(headers, "", fn {k, v} -> "#{k}: #{v}\r\n" end)
      :ok = :gen_tcp.send(s, "#{line} HTTP/1.1\r\nHost: 127.0.0.1\r\n#{hs}Connection: close\r\n\r\n")
      {:ok, resp} = :gen_tcp.recv(s, 0, 5_000)
      :gen_tcp.close(s)
      [_, code | _] = String.split(resp, " ", parts: 3)
      {String.to_integer(code), resp}
    end

    defp status(port, line, headers \\ []), do: elem(request(port, line, headers), 0)

    @upgrade [
      {"Upgrade", "websocket"},
      {"Connection", "Upgrade"},
      {"Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ=="},
      {"Sec-WebSocket-Version", "13"}
    ]

    test "HTTP: 401 without the header, 200 with it", %{port: port} do
      assert status(port, "GET /fs/read?path=x") == 401
      {401, resp} = request(port, "GET /fs/read?path=x", [{"Origin", "http://127.0.0.1:4001"}])
      assert resp =~ "access-control-allow-origin: http://127.0.0.1:4001"
      {401, resp} = request(port, "GET /fs/read?path=x", [{"Origin", "http://evil.example"}])
      refute resp =~ "access-control-allow-origin"
      assert status(port, "GET /fs/read?path=x", [{"X-Poca-Secret", @secret}]) == 200
      assert status(port, "GET /fs/read?path=x", [{"X-Poca-Secret", "wrong"}]) == 401
    end

    test "a ticket comes only with the header, and opens one handshake", %{port: port} do
      assert status(port, "GET /ticket") == 401

      {200, resp} =
        request(port, "GET /ticket", [{"X-Poca-Secret", @secret}, {"Origin", "http://127.0.0.1:4001"}])

      assert resp =~ "access-control-allow-origin: http://127.0.0.1:4001"
      [_, ticket] = Regex.run(~r/"ticket":"([^"]+)"/, resp)

      origin = [{"Origin", "http://127.0.0.1:4001"}]
      # the gate lets it through; the plain handler then answers 200
      assert status(port, "GET /?ticket=#{ticket}", @upgrade ++ origin) == 200
      assert status(port, "GET /?ticket=#{ticket}", @upgrade ++ origin) == 403
    end

    test "a browser's WebSocket without a ticket: 403; without Origin: through", %{port: port} do
      assert status(port, "GET /", @upgrade ++ [{"Origin", "http://127.0.0.1:4001"}]) == 403
      assert status(port, "GET /?ticket=made-up", @upgrade ++ [{"Origin", "http://127.0.0.1:4001"}]) == 403
      assert status(port, "GET /", @upgrade) == 200
    end

    test "a preflight is answered by the gate: what an allowed origin asks for", %{port: port} do
      ask = [
        {"Origin", "http://127.0.0.1:4001"},
        {"Access-Control-Request-Method", "PUT"},
        {"Access-Control-Request-Headers", "content-type,x-poca-secret,x-tezcatl-base"}
      ]

      # /fs/read's handler here (OkHandler) would answer 200: the gate answers first
      {204, resp} = request(port, "OPTIONS /fs/read", ask)
      assert resp =~ "access-control-allow-origin: http://127.0.0.1:4001"
      assert resp =~ "access-control-allow-methods: PUT"
      assert resp =~ "access-control-allow-headers: content-type,x-poca-secret,x-tezcatl-base"

      {204, resp} = request(port, "OPTIONS /fs/read", [{"Origin", "http://evil.example"} | tl(ask)])
      refute resp =~ "access-control-allow"
    end
  end
end
