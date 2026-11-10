# test/e2e/fake_xipe.exs -- a stand-in for `xipe serve`'s WebSocket, for
# checking the Xipe dialogue window before Xipe Totec implements `input`.
# Run inside the dev shell (needs cowboy): nix develop --command elixir test/e2e/fake_xipe.exs
#
#   initialize        -> a fixed project (id "fake")
#   input "help"      -> dialogue.text = "word: note" lines (what `xipe help` is to print)
#   input "ping"      -> an echo, plus a notify/passCompleted
#   input <other>     -> "unknown command: <other>"
#
# Like the real Serve.Socket, a connection answers `not_initialized` to any
# request before its own `initialize` -- so a client that does not
# re-initialize after the relay reconnects (Xipe Totec restarted) shows it.

port = String.to_integer(System.get_env("FAKE_XIPE_PORT") || "4202")
{:ok, _} = Application.ensure_all_started(:cowboy)

defmodule FakeXipe do
  @behaviour :cowboy_websocket

  @help """
  row/add: make a calc row
  row/list: list the calc rows
  eval/run: evaluate the given rows
  help: this list\
  """

  def init(req, _), do: {:cowboy_websocket, req, %{}, %{idle_timeout: :infinity}}
  def websocket_init(s), do: {:ok, s}
  def websocket_info(_, s), do: {:ok, s}

  def websocket_handle({:text, f}, s) do
    case :json.decode(f) do
      %{"method" => "initialize", "id" => id} ->
        {:reply, {:text, enc(%{"jsonrpc" => "2.0", "id" => id,
          "result" => %{"capabilities" => %{}, "project" => %{"id" => "fake", "root" => "/fake/project"}}})}, Map.put(s, :initialized, true)}

      %{"id" => id} when not is_map_key(s, :initialized) ->
        {:reply, {:text, enc(%{"jsonrpc" => "2.0", "id" => id,
          "error" => %{"code" => "not_initialized", "message" => "send initialize first"}})}, s}

      %{"method" => "input", "id" => id, "params" => %{"text" => t}} ->
        line = String.trim(t)
        text = case line do
          "help" -> @help
          "ping" -> "pong"
          other -> "unknown command: " <> other
        end
        reply = enc(%{"jsonrpc" => "2.0", "id" => id, "result" => %{}, "from" => nil,
          "dialogue" => %{"hold" => false, "via_repl" => false, "text" => text}})
        notify = if line == "ping",
          do: [{:text, enc(%{"jsonrpc" => "2.0", "method" => "notify/passCompleted", "params" => %{"ok" => true}})}],
          else: []
        {:reply, [{:text, reply} | notify], s}

      %{"id" => id} ->
        {:reply, {:text, enc(%{"jsonrpc" => "2.0", "id" => id, "error" => %{"code" => "unknown_method", "message" => "fake"}})}, s}

      _ ->
        {:ok, s}
    end
  end

  def websocket_handle(_, s), do: {:ok, s}
  defp enc(m), do: IO.iodata_to_binary(:json.encode(m))
end

dispatch = :cowboy_router.compile([{:_, [{"/", FakeXipe, []}]}])
{:ok, _} = :cowboy.start_clear(:fake_xipe, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, port}]}, %{env: %{dispatch: dispatch}})
IO.puts("fake xipe on #{port}")
Process.sleep(:infinity)
