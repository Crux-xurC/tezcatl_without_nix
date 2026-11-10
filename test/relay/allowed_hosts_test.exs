

defmodule AllowedHostsTest do
  use ExUnit.Case, async: false

  @env "TEZCATL_ALLOWED_HOSTS"

  defmodule OkHandler do
    def init(req, state) do
      {:ok, :cowboy_req.reply(200, %{"content-type" => "text/plain"}, "ok", req), state}
    end
  end

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    dispatch = :cowboy_router.compile([{:_, [{"/fs/read", OkHandler, []}]}])

    {:ok, _} =
      :cowboy.start_clear(
        :allowed_hosts_test,
        %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 0}]},
        %{env: %{dispatch: dispatch}, middlewares: [AllowedHosts, :cowboy_router, :cowboy_handler]}
      )

    on_exit(fn -> :cowboy.stop_listener(:allowed_hosts_test) end)
    %{port: :ranch.get_port(:allowed_hosts_test)}
  end

  setup do
    prev = System.get_env(@env)
    System.delete_env(@env)

    on_exit(fn ->
      if prev, do: System.put_env(@env, prev), else: System.delete_env(@env)
    end)

    :ok
  end

  # raw HTTP so the Host header is exactly what the test says (nil = none)
  defp status(port, host, version \\ "1.1") do
    {:ok, s} = :gen_tcp.connect(~c"127.0.0.1", port, [:binary, active: false])
    host_line = if host, do: "Host: #{host}\r\n", else: ""
    :ok = :gen_tcp.send(s, "GET /fs/read?path=x HTTP/#{version}\r\n#{host_line}Connection: close\r\n\r\n")
    {:ok, resp} = :gen_tcp.recv(s, 0, 5_000)
    :gen_tcp.close(s)
    [_, code | _] = String.split(resp, " ", parts: 3)
    String.to_integer(code)
  end

  describe "list/0" do
    test "no env var -> the loopback names" do
      assert AllowedHosts.list() == ["127.0.0.1", "localhost", "[::1]"]
    end

    test "env var adds to the defaults (trimmed, lowercased, blanks dropped)" do
      System.put_env(@env, " DevBox , ,tezcatl.test")
      assert AllowedHosts.list() == ["127.0.0.1", "localhost", "[::1]", "devbox", "tezcatl.test"]
    end
  end

  describe "check/1" do
    test "loopback names pass, in any case" do
      assert AllowedHosts.check("127.0.0.1") == :ok
      assert AllowedHosts.check("LocalHost") == :ok
      assert AllowedHosts.check("[::1]") == :ok
    end

    test "no Host (empty) passes -- a local non-browser program" do
      assert AllowedHosts.check("") == :ok
    end

    test "any other name is refused" do
      assert AllowedHosts.check("evil.example") == {:error, "evil.example"}
      assert AllowedHosts.check("127.0.0.1.evil.example") == {:error, "127.0.0.1.evil.example"}
    end

    test "honours the env addition" do
      System.put_env(@env, "devbox")
      assert AllowedHosts.check("devbox") == :ok
    end
  end

  describe "as cowboy middleware" do
    test "loopback Host passes whatever the port", %{port: port} do
      assert status(port, "127.0.0.1:#{port}") == 200
      assert status(port, "localhost:4100") == 200
      assert status(port, "localhost:9999") == 200
      assert status(port, "[::1]:#{port}") == 200
    end

    test "a rebound name gets 403 before any handler runs", %{port: port} do
      assert status(port, "evil.example:#{port}") == 403
      assert status(port, "evil.example") == 403
    end

    test "HTTP/1.0 with no Host passes", %{port: port} do
      assert status(port, nil, "1.0") == 200
    end

    test "env-added name passes", %{port: port} do
      System.put_env(@env, "devbox")
      assert status(port, "devbox:#{port}") == 200
    end
  end
end
