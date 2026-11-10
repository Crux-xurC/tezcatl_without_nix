
{:ok, _} = Application.ensure_all_started(:gun)
{:ok, _} = Application.ensure_all_started(:cowboy)


defmodule WindowsDeleteTest do
  use ExUnit.Case, async: false

  setup_all do
    pid =
      case VentUplink.start_link(%{host: "127.0.0.1", port: 4000}) do
        {:ok, p} -> p
        {:error, {:already_started, p}} -> p
      end

    %{uplink: pid}
  end

  defp fake_client(id, name) do
    parent = self()

    pid =
      spawn(fn ->
        VentUplink.register(self(), id, name)
        send(parent, {:registered, self()})

        receive do
          :evict -> send(parent, {:evicted, self()})
        after
          2000 -> send(parent, {:timeout, self()})
        end

        receive do
          :stop -> :ok
        after
          2000 -> :ok
        end
      end)

    assert_receive {:registered, ^pid}, 1000
    pid
  end

  test "evict/1 finds the connection by its announced id and tells it to close" do
    pid = fake_client("c-alpha", "tezcatl-1")
    assert Enum.any?(VentUplink.list(), &(&1.id == "c-alpha"))

    assert {:ok, "tezcatl-1"} = VentUplink.evict("c-alpha")
    assert_receive {:evicted, ^pid}, 1000
  end

  test "evict/1 on an unknown id -> :not_found, nobody is disturbed" do
    pid = fake_client("c-beta", "tezcatl-2")

    assert VentUplink.evict("c-does-not-exist") == :not_found

    refute_receive {:evicted, ^pid}, 200
  end

  test "a connection that never sent ?id= (nil in the registry) is not addressable" do
    pid = fake_client(nil, "unlabelled")

    assert VentUplink.evict("") == :not_found
    assert VentUplink.evict(nil) == :not_found
    assert VentUplink.evict("nil") == :not_found

    refute_receive {:evicted, ^pid}, 200
  end

  test "the registry is not edited by evict/1 -- the socket's terminate does that" do
    _pid = fake_client("c-gamma", "tezcatl-3")
    assert {:ok, "tezcatl-3"} = VentUplink.evict("c-gamma")

    assert Enum.any?(VentUplink.list(), &(&1.id == "c-gamma"))
  end

  test "BrowserSocket replies to :evict with a 4000 (\"evicted\") close" do
    assert {:reply, {:close, 4000, "evicted"}, %{x: 1}} =
             BrowserSocket.websocket_info(:evict, %{x: 1})
  end
end
