# test/relay/sql_test.exs -- the pure parts of lib/relay/sql.exs (D-db-backend,
# D-db-session): where the server is, a login's options, the numbers of the
# database windows, values as JSON carries them, answers and failures. Needs
# no database (the E2E reaches the real one).

defmodule SqlTest do
  use ExUnit.Case, async: true

  test "server: the defaults; the account offered first is local.env's user, never a password" do
    assert Sql.server(fn _ -> nil end) == %{hostname: "127.0.0.1", port: 3306, database: "tezcatl", account: nil}
    env = %{"TEZCATL_DB_USER" => "tezcatl", "TEZCATL_DB_PORT" => "3307", "TEZCATL_DB_NAME" => "tezcatl_e2e", "TEZCATL_DB_PASSWORD" => "pw"}
    sv = Sql.server(&Map.get(env, &1))
    assert sv == %{hostname: "127.0.0.1", port: 3307, database: "tezcatl_e2e", account: "tezcatl"}
    assert Sql.server(&Map.get(%{"TEZCATL_DB_PORT" => "nope", "TEZCATL_DB_USER" => ""}, &1)) |> Map.take([:port, :account]) == %{port: 3306, account: nil}
  end

  test "connect_opts: one connection, never made again by itself, nothing sensitive in its errors" do
    o = Sql.connect_opts(Sql.server(fn _ -> nil end), "a", "p")
    assert o[:username] == "a" and o[:password] == "p" and o[:pool_size] == 1
    assert o[:backoff_type] == :stop and o[:show_sensitive_data_on_connection_error] == false
    assert o[:connection_listeners] == []
    assert Sql.connect_opts(Sql.server(fn _ -> nil end), "a", "p", self())[:connection_listeners] == {[self()], {:db_session, :conn}}
  end

  test "account?: a name, not a line" do
    assert Sql.account?("tezcatl")
    refute Sql.account?("") or Sql.account?(nil) or Sql.account?("a\nb") or Sql.account?(String.duplicate("a", 81))
  end

  test "DbWindows.free: the smallest free from 2; a number asked is given only when free; 1 is the intents'" do
    assert DbWindows.free([], nil) == 2
    assert DbWindows.free([2, 3, 5], nil) == 4
    assert DbWindows.free([1], nil) == 2
    assert DbWindows.free([], 1) == 1
    assert DbWindows.free([1], 1) == :in_use
    assert DbWindows.free([], 7) == 7
    assert DbWindows.free([], 0) == :bad and DbWindows.free([], "2") == :bad
  end

  test "DbWindows: a number is held while its window lives, then free again" do
    {:ok, _} = DbWindows.start_link([])
    me = self()
    w = spawn(fn -> receive do: (:go -> :ok) end)
    assert DbWindows.claim(nil, w) == {:ok, 2}
    assert DbWindows.claim(1, me) == {:ok, 1}
    assert DbWindows.claim(1, me) == {:error, :in_use}
    DbWindows.set(2, %{account: "a", state: "waiting"})
    assert [%{"id" => 1, "state" => "logged out"}, %{"id" => 2, "account" => "a", "state" => "waiting"}] = DbWindows.list()
    send(w, :go)
    Process.sleep(50)
    assert [%{"id" => 1}] = DbWindows.list()
    assert DbWindows.claim(nil, me) == {:ok, 2}
  end

  test "login: a refusal never carries the password (no server on the port)" do
    {:ok, l} = :gen_tcp.listen(0, ip: {127, 0, 0, 1})
    {:ok, port} = :inet.port(l)
    :gen_tcp.close(l)
    sv = %{hostname: "127.0.0.1", port: port, database: "x", account: "a"}
    assert {:error, a} = Sql.login(sv, "a", "secret-pw-here")
    refute inspect(a) =~ "secret-pw-here"
    refute inspect(Sql.failure({:weird, [password: "secret-pw-here"]})) =~ "secret-pw-here"
    refute inspect(Sql.failure(%KeyError{key: :k, term: [password: "secret-pw-here"]})) =~ "secret-pw-here"
  end

  test "args: an intent's values for the statement's ?s -- scalars only, at most 100" do
    assert Sql.args(nil) == {:ok, []} and Sql.args(:null) == {:ok, []}
    assert Sql.args(["a", 1, 1.5, true, :null]) == {:ok, ["a", 1, 1.5, true, nil]}
    assert Sql.args([%{"a" => 1}]) == :error and Sql.args([[1]]) == :error and Sql.args("a") == :error
    assert Sql.args(List.duplicate(1, 100)) |> elem(0) == :ok
    assert Sql.args(List.duplicate(1, 101)) == :error
  end

  test "value: text, numbers and null as they are; the rest as their usual text" do
    assert Sql.value(nil) == :null
    assert Sql.value(42) == 42 and Sql.value(1.5) == 1.5
    assert Sql.value("日本語") == "日本語"
    assert Sql.value(<<0xFF, 0x00>>) == "0xFF00"
    assert Sql.value(Decimal.new("1.50")) == "1.50"
    assert Sql.value(~D[2026-10-21]) == "2026-10-21"
    assert Sql.value(~U[2026-10-21 03:56:29Z]) == "2026-10-21T03:56:29Z"
    assert Sql.value(~N[2026-10-21 03:56:29]) == "2026-10-21T03:56:29"
    assert Sql.value(~T[03:56:29]) == "03:56:29"
  end

  test "answer: rows (cut at 5000, said); a statement without columns says what it changed" do
    a = Sql.answer(%{columns: ["n", "z"], rows: [[1, nil]], num_rows: 1})
    assert a == %{"ok" => true, "columns" => ["n", "z"], "rows" => [[1, :null]], "num_rows" => 1, "truncated" => false}
    many = for i <- 1..5001, do: [i]
    a = Sql.answer(%{columns: ["i"], rows: many, num_rows: 5001})
    assert length(a["rows"]) == 5000 and a["truncated"] and a["num_rows"] == 5001
    assert Sql.answer(%{columns: nil, rows: nil, num_rows: 2, last_insert_id: 7}) ==
             %{"ok" => true, "columns" => :null, "num_rows" => 2, "last_insert_id" => 7}
  end

  test "failure: the server's message and its name, as they are; a lost connection ends the session" do
    e = %MyXQL.Error{message: "(1146) (ER_NO_SUCH_TABLE) Table 'x.y' doesn't exist", mysql: %{code: 1146, name: :ER_NO_SUCH_TABLE}}
    assert Sql.failure(e) == %{"ok" => false, "error" => e.message, "code" => "ER_NO_SUCH_TABLE"}
    down = Sql.failure(%DBConnection.ConnectionError{message: "down"})
    assert down["code"] == "connection" and Sql.gone?(down)
    refute Sql.gone?(Sql.failure(e))
  end

  test "loads: an intent's books -- names under ~work/books, tables of letters, digits and _" do
    assert Sql.loads(nil) == {:ok, []} and Sql.loads(:null) == {:ok, []}
    assert Sql.loads([%{"book" => "decode/magit.changed-files", "as" => "t_in"}]) == {:ok, [{"decode/magit.changed-files", "t_in"}]}
    for b <- ["../x", "a/../b", "/abs", "a//b", "", "a b", ".", 1] do
      assert {:error, "load: a book" <> _} = Sql.loads([%{"book" => b, "as" => "t"}])
    end
    for t <- ["1t", "t-x", "t`", "", String.duplicate("t", 65)] do
      assert {:error, "load: as" <> _} = Sql.loads([%{"book" => "b", "as" => t}])
    end
    assert {:error, _} = Sql.loads([%{"book" => "b"}])
    assert {:error, _} = Sql.loads(List.duplicate(%{"book" => "b", "as" => "t"}, 9))
    assert Sql.book_path("/w", "run/x") == "/w/books/run/x.json"
  end

  test "book: columns and rows as text cells; short rows filled; what is not a book is said" do
    assert Sql.book(%{"columns" => ["a", "b"], "rows" => [["x", 1], ["y"], [:null, true]]}) ==
             {:ok, ["a", "b"], [["x", "1"], ["y", nil], [nil, "true"]]}
    assert {:error, _} = Sql.book(%{"columns" => [], "rows" => []})
    assert {:error, _} = Sql.book(%{"columns" => ["a"], "rows" => [["x", "y"]]})
    assert {:error, _} = Sql.book(%{"columns" => ["_n"], "rows" => []})
    assert {:error, _} = Sql.book(%{"columns" => [1], "rows" => []})
    assert {:error, _} = Sql.book(%{"rows" => []})
  end

  test "read_book: a file of the work place; none, too large or not JSON is said" do
    dir = Path.join(System.tmp_dir!(), "sql_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(dir, "books/run"))
    p = Sql.book_path(dir, "run/x")
    File.write!(p, ~s({"name":"x","columns":["id","line"],"rows":[["1","a"]]}))
    assert Sql.read_book(p) == {:ok, ["id", "line"], [["1", "a"]]}
    assert Sql.read_book(Sql.book_path(dir, "none")) == {:error, "no such book"}
    File.write!(p, "{")
    assert Sql.read_book(p) == {:error, "not JSON"}
    File.rm_rf!(dir)
  end

  test "load_statements: a temporary table made again; names quoted; cells only as values, in batches" do
    {create, [{ins, vals}]} = Sql.load_statements("t_in", ["section", "a`b"], [["s", "x"], ["u", nil]])
    assert create == "CREATE OR REPLACE TEMPORARY TABLE `t_in` (`_n` INT NOT NULL, `section` TEXT, `a``b` TEXT)"
    assert ins == "INSERT INTO `t_in` (`_n`, `section`, `a``b`) VALUES (?, ?, ?), (?, ?, ?)"
    assert vals == [1, "s", "x", 2, "u", nil]
    {_, inserts} = Sql.load_statements("t", ["a"], for(i <- 1..2_500, do: [to_string(i)]))
    assert Enum.map(inserts, fn {_, v} -> div(length(v), 2) end) == [1_000, 1_000, 500]
    assert {_, []} = Sql.load_statements("t", ["a"], [])
  end
end
