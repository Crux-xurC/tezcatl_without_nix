
# A stand-in registry: hands out the pids queued in an Agent, one per call,
# and counts the calls -- so a test can hand out a server that is already gone.
defmodule LspRegistry do
  def attach_or_start(_key, _spec, _consumer) do
    Agent.get_and_update(:fake_lsp_registry, fn
      [pid | rest] -> {{:ok, pid}, rest}
      [] -> {{:error, "no server"}, []}
    end)
  end
end


# LspSocket.attach_server/4:
# a server that stops between the registry's answer and the attach call must
# not take the socket process down -- ask the registry again, else an error.
defmodule LspSocketAttachTest do
  use ExUnit.Case, async: false

  defmodule FakeServer do
    use GenServer
    def init(meta), do: {:ok, meta}
    def handle_call({:attach, _consumer, _client}, _from, meta), do: {:reply, {:ok, meta}, meta}
  end

  defp dead_pid do
    pid = spawn(fn -> :ok end)
    ref = Process.monitor(pid)
    receive do: ({:DOWN, ^ref, _, _, _} -> pid)
  end

  defp live_server do
    {:ok, pid} = GenServer.start(FakeServer, %{root_uri: "file:///r", server_id: "js"})
    pid
  end

  setup do
    {:ok, _} = Agent.start_link(fn -> [] end, name: :fake_lsp_registry)
    :ok
  end

  defp queue(pids), do: Agent.update(:fake_lsp_registry, fn _ -> pids end)

  test "a live server attaches and is monitored" do
    live = live_server()
    queue([live])
    assert {:ok, ^live, mon, %{server_id: "js"}} = LspSocket.attach_server({"/r", "js"}, %{}, 2)
    assert is_reference(mon)
  end

  test "a server gone before the attach: asks the registry again and attaches to the new one" do
    live = live_server()
    queue([dead_pid(), live])
    assert {:ok, ^live, _mon, _meta} = LspSocket.attach_server({"/r", "js"}, %{}, 2)
    # the dead server's monitor was flushed, not left to close the socket later
    refute_receive {:DOWN, _, :process, _, _}, 50
  end

  test "gone every time: an error, and the caller is still alive" do
    queue([dead_pid(), dead_pid()])
    assert {:error, "language server stopped while attaching"} =
             LspSocket.attach_server({"/r", "js"}, %{}, 2)
  end

  test "the registry's own error passes through" do
    queue([])
    assert {:error, "no server"} = LspSocket.attach_server({"/r", "js"}, %{}, 2)
  end
end
