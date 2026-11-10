defmodule Sql do
  # A database as a backend (D-db-backend): MariaDB, started outside Tezcatl
  # like Emacs and Xipe Totec, reached on 127.0.0.1 through MyXQL. The relay
  # only carries a statement in and the answer out: SQL's meaning is the
  # server's, never read here.
  #
  # Nothing logs in by itself (D-db-session): a person logs in to a numbered
  # database window (SqlSocket), and that window's session is its own pair of
  # connections -- one runs its statements (a temporary table made by one is
  # there for the next), the other is kept for KILL QUERY. The password is
  # used to connect and kept in no file or variable; the connections hold it
  # in memory while they live, and never reconnect with it (backoff :stop).
  #
  # Where: TEZCATL_DB_HOST, TEZCATL_DB_PORT (3306), TEZCATL_DB_NAME (tezcatl),
  # and TEZCATL_DB_USER, the account offered first (local.env; no password).
  # The account is meant to see only its own databases (what Tezcatl can touch
  # is the server's grant, not a check here).

  @max_rows 5_000

  @doc "where the server is, and the account offered first (nil when local.env names none)"
  def server(env \\ &System.get_env/1) do
    %{
      hostname: env.("TEZCATL_DB_HOST") || "127.0.0.1",
      port: port(env.("TEZCATL_DB_PORT")),
      database: env.("TEZCATL_DB_NAME") || "tezcatl",
      account: blank_nil(env.("TEZCATL_DB_USER"))
    }
  end

  defp blank_nil(s) when is_binary(s) and s != "", do: s
  defp blank_nil(_), do: nil

  defp port(s) do
    case Integer.parse(s || "") do
      {n, ""} when n > 0 and n < 65_536 -> n
      _ -> 3306
    end
  end

  @doc """
  the connection options of one login. `listener` (the window's socket) hears
  {:connected | :disconnected, pid, {:db_session, role}} for each connection:
  when one drops or crashes, DBConnection makes it again quietly -- a new
  session, its temporary tables gone -- so the window ends its session
  instead (SqlSocket: a disconnect, or a second process connecting).
  """
  def connect_opts(server, account, password, listener \\ nil, role \\ :conn) do
    [
      hostname: server.hostname,
      port: server.port,
      database: server.database,
      username: account,
      password: password,
      pool_size: 1,
      ssl: false,
      # a session that ended is not made again behind the person's back (its
      # temporary tables would be gone); the window says it is logged out
      backoff_type: :stop,
      show_sensitive_data_on_connection_error: false,
      connection_listeners: if(listener, do: {[listener], {:db_session, role}}, else: [])
    ]
  end

  @doc "an account name as the server takes it (the name only; never a password)"
  def account?(a), do: is_binary(a) and a != "" and byte_size(a) <= 80 and String.valid?(a) and not String.contains?(a, ["\0", "\n"])

  @doc """
  Log in: check the account and password once (the server's refusal as it is),
  then open the session's two connections -> {:ok, %{conn, killer, connection_id}} | {:error, answer}
  """
  def login(server, account, password, listener \\ nil) do
    {:ok, _} = Application.ensure_all_started(:myxql)
    opts = connect_opts(server, account, password, listener)

    # MyXQL.Connection.connect traps exits in its caller: try it in a process
    # of its own. What MyXQL.start_link adds to the options is added here
    # (disconnect_on_error_codes: 1461, ER_MAX_PREPARED_STMT_COUNT_REACHED).
    # Nothing raised here may leave with the options -- they hold the
    # password, and an exception's term or a crash report would print them.
    probe =
      Task.async(fn ->
        try do
          case MyXQL.Connection.connect(Keyword.merge(opts, disconnect_on_error_codes: [1461], connection_listeners: [])) do
            {:ok, st} -> MyXQL.Connection.disconnect(:normal, st)
            {:error, e} -> {:error, failure(e)}
          end
        rescue
          e -> {:error, %{"ok" => false, "error" => "could not log in (#{inspect(e.__struct__)})", "code" => "connection"}}
        catch
          kind, _ -> {:error, %{"ok" => false, "error" => "could not log in (#{kind})", "code" => "connection"}}
        end
      end)

    case Task.await(probe, 20_000) do
      {:error, a} ->
        {:error, a}

      _ ->
        with {:ok, conn} <- start(opts),
             {:ok, killer} <- start(connect_opts(server, account, password, listener, :killer)),
             {:ok, %{rows: [[id]]}} <- MyXQL.query(conn, "SELECT CONNECTION_ID()", [], query_type: :text) do
          {:ok, %{conn: conn, killer: killer, connection_id: id}}
        else
          {:error, e} -> {:error, failure(e)}
          _ -> {:error, %{"ok" => false, "error" => "could not log in", "code" => "unknown"}}
        end
    end
  rescue
    # never the exception itself: its term may hold the options (the password)
    e -> {:error, %{"ok" => false, "error" => "could not log in (#{inspect(e.__struct__)})", "code" => "connection"}}
  catch
    :exit, _ -> {:error, %{"ok" => false, "error" => "no answer from the database", "code" => "no_answer"}}
  end

  # not linked: the window watches its connections and says when one ends
  defp start(opts) do
    case MyXQL.start_link(opts) do
      {:ok, pid} ->
        Process.unlink(pid)
        {:ok, pid}

      e ->
        e
    end
  end

  def logout(%{conn: c, killer: k}) do
    for p <- [c, k], is_pid(p), Process.alive?(p), do: GenServer.stop(p, :normal, 5_000)
    :ok
  catch
    :exit, _ -> :ok
  end

  @doc """
  run a text on a session's connection, as it is -> {:ok, answer} | {:error, answer}.
  Nothing is split here. The server takes several statements in one text
  (MyXQL always asks for that), but MyXQL 0.9.0 cannot carry their answers:
  query raises on a second result, and query_many fails on a refusal. So a
  text with more than one statement is said to be one, after the server ran
  it (what it changed stays changed); MyXQL drops the connection with it, so
  the session ends (SqlSocket hears it).

  With arguments (an intent's, D-db-session), the statement is prepared and
  they go to its `?` as values -- never put into the text.
  """
  def run(conn, statement, args \\ []) do
    type = if args == [], do: :text, else: :binary

    case MyXQL.query(conn, statement, args, query_type: type, timeout: :infinity) do
      {:ok, result} -> {:ok, answer(result)}
      {:error, e} -> {:error, failure(e)}
    end
  rescue
    e in RuntimeError ->
      if e.message =~ "multiple results",
        do: {:error, %{"ok" => false, "code" => "several_statements",
                       "error" => "the server ran more than one statement; their answers cannot be carried here, and the session ended with it -- one statement at a time"}},
        else: {:error, failure(e)}

    e ->
      {:error, failure(e)}
  catch
    :exit, reason -> {:error, %{"ok" => false, "error" => "no answer from the database (#{inspect(reason)})", "code" => "no_answer"}}
  end

  @doc "an intent's arguments: up to 100 values (text, numbers, true / false, null) -> {:ok, list} | :error"
  def args(nil), do: {:ok, []}
  def args(:null), do: {:ok, []}

  def args(l) when is_list(l) and length(l) <= 100 do
    if Enum.all?(l, &(is_binary(&1) or is_number(&1) or is_boolean(&1) or &1 in [nil, :null])),
      do: {:ok, Enum.map(l, fn v -> if v == :null, do: nil, else: v end)},
      else: :error
  end

  def args(_), do: :error

  # -- an intent's books (D-db-session): a book of the work place made a
  # temporary table of window 1's session just before the intent's statement.
  # A book is Tezcatl's own table ({columns, rows: [[cell]]}, ~work/books/
  # <name>.json); its columns become text columns as they are named, with
  # `_n` (the row's place in the book, from 1) first. The table is made again
  # each time (CREATE OR REPLACE): nothing of the last run stays in it.

  @book_cap 8_000_000
  @max_loads 8

  @doc "an intent's loads: up to #{@max_loads} of {book, as} -> {:ok, [{book, table}]} | {:error, text}"
  def loads(nil), do: {:ok, []}
  def loads(:null), do: {:ok, []}

  def loads(l) when is_list(l) and length(l) <= @max_loads do
    Enum.reduce_while(l, {:ok, []}, fn
      %{"book" => b, "as" => t}, {:ok, acc} ->
        cond do
          not book_name?(b) -> {:halt, {:error, "load: a book is a name under ~work/books, without .json (#{inspect(b)})"}}
          not table_name?(t) -> {:halt, {:error, "load: as is a table name of letters, digits and _ (#{inspect(t)})"}}
          true -> {:cont, {:ok, acc ++ [{b, t}]}}
        end

      _, _ ->
        {:halt, {:error, "load: [{book, as}]"}}
    end)
  end

  def loads(_), do: {:error, "load: up to #{@max_loads} of {book, as}"}

  @doc "a book's name: a path under ~work/books without .json (run/x, decode/magit.log)"
  def book_name?(b) do
    is_binary(b) and byte_size(b) <= 200 and Regex.match?(~r{\A[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*\z}, b) and
      not Enum.any?(String.split(b, "/"), &(&1 in [".", ".."]))
  end

  @doc "a temporary table's name, as an intent gives it"
  def table_name?(t), do: is_binary(t) and Regex.match?(~r/\A[A-Za-z_][A-Za-z0-9_]{0,63}\z/, t)

  def book_path(work_root, name), do: Path.join([work_root, "books", name <> ".json"])

  @doc "a book file -> {:ok, columns, rows} | {:error, text}"
  def read_book(path) do
    case File.stat(path) do
      {:ok, %File.Stat{type: :regular, size: n}} when n <= @book_cap ->
        with {:ok, bytes} <- File.read(path),
             {:ok, j} <- json(bytes) do
          book(j)
        else
          {:error, e} when is_binary(e) -> {:error, e}
          {:error, e} -> {:error, "cannot read it (#{inspect(e)})"}
        end

      {:ok, %File.Stat{type: :regular}} -> {:error, "larger than 8 MB"}
      {:ok, _} -> {:error, "not a file"}
      {:error, :enoent} -> {:error, "no such book"}
      {:error, e} -> {:error, "cannot read it (#{inspect(e)})"}
    end
  end

  defp json(bytes) do
    {:ok, :json.decode(bytes)}
  rescue
    _ -> {:error, "not JSON"}
  end

  @doc "a book's columns and rows as they go to the table (cells as text, nil for none)"
  def book(%{"columns" => cols, "rows" => rows}) when is_list(cols) and is_list(rows) do
    w = length(cols)

    cond do
      w == 0 -> {:error, "a book with no columns"}
      not Enum.all?(cols, &(is_binary(&1) and &1 != "" and not String.contains?(&1, <<0>>))) -> {:error, "its columns are not names"}
      "_n" in cols -> {:error, "a column named _n (the row's place is that)"}
      not Enum.all?(rows, &(is_list(&1) and length(&1) <= w)) -> {:error, "a row that is not a list of at most #{w} cells"}
      true -> {:ok, cols, Enum.map(rows, fn r -> Enum.map(r ++ List.duplicate(nil, w - length(r)), &cell/1) end)}
    end
  end

  def book(_), do: {:error, "not a book ({columns, rows})"}

  defp cell(v) when is_binary(v), do: v
  defp cell(v) when v in [nil, :null], do: nil
  defp cell(v) when is_integer(v) or is_float(v), do: to_string(v)
  defp cell(v) when is_boolean(v), do: to_string(v)
  defp cell(v), do: IO.iodata_to_binary(:json.encode(v))

  @doc """
  the statements that make a book a temporary table -> {create, [{insert, values}]}:
  names quoted (a backtick doubled), the cells always values of `?`s, in
  batches under the server's limit of placeholders
  """
  def load_statements(table, cols, rows) do
    create =
      "CREATE OR REPLACE TEMPORARY TABLE #{quote_name(table)} (`_n` INT NOT NULL, " <>
        Enum.map_join(cols, ", ", &(quote_name(&1) <> " TEXT")) <> ")"

    names = Enum.map_join(["_n" | cols], ", ", &quote_name/1)
    one = "(" <> Enum.map_join(0..length(cols), ", ", fn _ -> "?" end) <> ")"
    per = max(1, min(1_000, div(60_000, length(cols) + 1)))

    inserts =
      rows
      |> Enum.with_index(1)
      |> Enum.chunk_every(per)
      |> Enum.map(fn chunk ->
        {"INSERT INTO #{quote_name(table)} (#{names}) VALUES " <> Enum.map_join(chunk, ", ", fn _ -> one end),
         Enum.flat_map(chunk, fn {r, n} -> [n | r] end)}
      end)

    {create, inserts}
  end

  def quote_name(n), do: "`" <> String.replace(n, "`", "``") <> "`"

  @doc "load an intent's books into the session, in order -> :ok | {:error, answer}"
  def load_books(conn, work_root, loads) do
    Enum.reduce_while(loads, :ok, fn {b, t}, :ok ->
      case load_book(conn, book_path(work_root, b), t) do
        :ok -> {:cont, :ok}
        {:error, a} -> {:halt, {:error, Map.update(a, "error", "", &("load #{b} as #{t}: " <> &1))}}
      end
    end)
  end

  defp load_book(conn, path, t) do
    case read_book(path) do
      {:ok, cols, rows} ->
        {create, inserts} = load_statements(t, cols, rows)

        Enum.reduce_while([{create, []} | inserts], :ok, fn {st, vals}, :ok ->
          case run(conn, st, vals) do
            {:ok, _} -> {:cont, :ok}
            {:error, a} -> {:halt, {:error, a}}
          end
        end)

      {:error, e} ->
        {:error, %{"ok" => false, "error" => e, "code" => "load"}}
    end
  end

  @doc "stop what connection `id` is running, through the session's second connection"
  def cancel(killer, id) when is_integer(id) do
    case MyXQL.query(killer, "KILL QUERY #{id}", [], query_type: :text, timeout: 10_000) do
      {:ok, _} -> :ok
      {:error, e} -> {:error, failure(e)}
    end
  catch
    :exit, reason -> {:error, %{"ok" => false, "error" => "no answer from the database (#{inspect(reason)})", "code" => "no_answer"}}
  end

  @doc "a result as the answer: rows for a statement that has columns, else what it changed"
  def answer(%{columns: nil} = r) do
    %{"ok" => true, "columns" => :null, "num_rows" => r.num_rows || 0, "last_insert_id" => r.last_insert_id || :null}
  end

  def answer(%{columns: cols, rows: rows} = r) do
    rows = rows || []
    %{
      "ok" => true,
      "columns" => cols,
      "rows" => rows |> Enum.take(@max_rows) |> Enum.map(fn row -> Enum.map(row, &value/1) end),
      "num_rows" => r.num_rows || length(rows),
      "truncated" => length(rows) > @max_rows
    }
  end

  @doc "an error as the answer: the server's message and code as they are"
  def failure(%{__struct__: MyXQL.Error, message: m, mysql: my}) do
    code = if is_map(my), do: my[:name] || my[:code], else: nil
    %{"ok" => false, "error" => m, "code" => to_code(code)}
  end

  def failure(%{message: m}) when is_binary(m), do: %{"ok" => false, "error" => m, "code" => "connection"}
  # anything else by its kind only: a term may hold what it was called with
  def failure(%{__struct__: m}), do: %{"ok" => false, "error" => "failed (#{inspect(m)})", "code" => "unknown"}
  def failure(_), do: %{"ok" => false, "error" => "failed", "code" => "unknown"}

  @doc "an answer that says the session is gone (the window is logged out)"
  def gone?(%{"code" => c}), do: c in ["connection", "no_answer"]
  def gone?(_), do: false

  defp to_code(nil), do: :null
  defp to_code(c) when is_atom(c), do: Atom.to_string(c)
  defp to_code(c), do: to_string(c)

  @doc "a value as JSON can carry it: text as it is, numbers, null; others as their usual text"
  def value(nil), do: :null
  def value(v) when is_integer(v) or is_float(v), do: v
  def value(v) when is_binary(v), do: if(String.valid?(v), do: v, else: "0x" <> Base.encode16(v))
  def value(%Decimal{} = d), do: Decimal.to_string(d, :normal)
  def value(%DateTime{} = d), do: DateTime.to_iso8601(d)
  def value(%NaiveDateTime{} = d), do: NaiveDateTime.to_iso8601(d)
  def value(%Date{} = d), do: Date.to_iso8601(d)
  def value(%Time{} = t), do: Time.to_iso8601(t)
  def value(v), do: inspect(v)
end

defmodule DbWindows do
  # The ledger of database windows (D-db-session): number -> who holds it
  # (its /sql socket), the account and database, the state ("logged out",
  # "waiting", "running") and the session's connection id. The number belongs
  # to the window: it is kept across logging out and in, and freed only when
  # the socket goes (closed, reloaded -- a reload asks for it again).
  # Window 1 is the intents'; a window opened without a number gets the
  # smallest free from 2.
  use GenServer

  def start_link(_), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  @doc "the number for a window asking for `want` (nil: any) when `taken` are used -> n | :in_use | :bad"
  def free(taken, nil), do: Enum.find(Stream.iterate(2, &(&1 + 1)), &(&1 not in taken))
  def free(taken, n) when is_integer(n) and n >= 1 and n < 1_000, do: if(n in taken, do: :in_use, else: n)
  def free(_taken, _), do: :bad

  def claim(want, pid), do: GenServer.call(__MODULE__, {:claim, want, pid})
  def set(n, fields), do: GenServer.cast(__MODULE__, {:set, n, fields})
  def list, do: GenServer.call(__MODULE__, :list)

  @impl true
  def init(:ok), do: {:ok, %{}}

  @impl true
  def handle_call({:claim, want, pid}, _from, w) do
    case free(Map.keys(w), want) do
      n when is_integer(n) ->
        mon = Process.monitor(pid)
        {:reply, {:ok, n}, Map.put(w, n, %{pid: pid, mon: mon, account: nil, database: nil, state: "logged out", connection_id: nil})}

      other ->
        {:reply, {:error, other}, w}
    end
  end

  def handle_call(:list, _from, w) do
    rows =
      w
      |> Enum.sort_by(&elem(&1, 0))
      |> Enum.map(fn {n, e} ->
        %{"id" => n, "account" => e.account || :null, "database" => e.database || :null, "state" => e.state,
          "connection_id" => e.connection_id || :null}
      end)

    {:reply, rows, w}
  end

  @impl true
  def handle_cast({:set, n, fields}, w) do
    {:noreply, if(Map.has_key?(w, n), do: Map.update!(w, n, &Map.merge(&1, fields)), else: w)}
  end

  @impl true
  def handle_info({:DOWN, mon, :process, _pid, _}, w) do
    {:noreply, w |> Enum.reject(fn {_n, e} -> e.mon == mon end) |> Map.new()}
  end

  def handle_info(_, w), do: {:noreply, w}
end

defmodule SqlSocket do
  # /sql -- one WebSocket per database window (D-db-session). JSON frames:
  #
  #   -> {"kind":"hello","id":<n>|null}        first: the window's number (null: the smallest free from 2)
  #   <- {"kind":"number","id":n,"host","port","database","account":<offered first>|null}
  #    | {"kind":"refused","error":…}            the number is another window's (the socket closes)
  #   -> {"kind":"login","account":a,"password":p}
  #   <- {"kind":"state","state":"waiting","account":a,"connection_id":id} | {"kind":"login_failed","error","code"}
  #   -> {"kind":"run","req":r,"statement":s}   one at a time; on window 1 only with "intent" (the intents' window:
  #        ,"intent":id,"args":[…]                  its command line sends login, exit, cancel only); args go to the ?s;
  #        ,"load":[{"book":b,"as":t}]              books (~work/books/<b>.json) made temporary tables first (window 1 only)
  #   <- {"kind":"state","state":"running"} … {"kind":"answer","req":r, <Sql answer>} {"kind":"state","state":"waiting"}
  #   -> {"kind":"cancel"}                      KILL QUERY on the second connection
  #   -> {"kind":"exit"}                        log out (the window and its number stay)
  #   <- {"kind":"state","state":"logged out","why":…}   also when the session ended by itself
  #   <- {"kind":"said","error":…[,"req":r]}    what cannot be done now (a run refused: its req)
  #
  # Origin-strict like /fs/write (statements may change data). The password
  # is never logged, echoed or put in the ledger.
  @behaviour :cowboy_websocket
  require Logger

  @cap 1_000_000

  @impl true
  def init(req, _opts) do
    case AllowedOrigins.check(:cowboy_req.header("origin", req, :undefined)) do
      :ok ->
        {:cowboy_websocket, req, %{id: nil, session: nil, account: nil, task: nil, inner: %{}}, %{idle_timeout: :infinity, max_frame_size: @cap + 4096}}

      {:error, origin} ->
        Logger.info("sql: rejecting handshake, disallowed Origin #{inspect(origin)}")
        req = :cowboy_req.reply(403, %{"content-type" => "text/plain"}, "forbidden origin\n", req)
        {:ok, req, %{}}
    end
  end

  @impl true
  def websocket_init(state), do: {:ok, state}

  @impl true
  def websocket_handle({:text, frame}, state) do
    case decode(frame) do
      {:ok, msg} -> on(msg, state)
      _ -> said("not a message (JSON with a kind)", state)
    end
  end

  def websocket_handle(_frame, state), do: {:ok, state}

  defp on(%{"kind" => "hello"} = m, %{id: nil} = s) do
    want = m["id"]
    want = if want in [nil, :null], do: nil, else: want

    case DbWindows.claim(want, self()) do
      {:ok, n} ->
        sv = Sql.server()
        DbWindows.set(n, %{database: sv.database})
        out = %{"kind" => "number", "id" => n, "host" => sv.hostname, "port" => sv.port, "database" => sv.database,
                "account" => sv.account || :null}
        {:reply, {:text, enc(out)}, %{s | id: n}}

      {:error, :in_use} ->
        {:reply, [{:text, enc(%{"kind" => "refused", "error" => "database window #{want} is open elsewhere"})}, {:close, 1000, "in use"}], s}

      {:error, _} ->
        {:reply, [{:text, enc(%{"kind" => "refused", "error" => "a window number is 1 to 999"})}, {:close, 1000, "bad id"}], s}
    end
  end

  defp on(_m, %{id: nil} = s), do: said("say hello first", s)
  defp on(%{"kind" => "hello"}, s), do: said("this window is already database window #{s.id}", s)

  defp on(%{"kind" => "login"} = m, s) do
    account = m["account"]
    password = m["password"]

    cond do
      s.session != nil -> said("already logged in as #{s.account} (db exit #{s.id} first)", s)
      not Sql.account?(account) -> said("an account name", s)
      not is_binary(password) -> said("a password", s)
      true ->
        case Sql.login(Sql.server(), account, password, self()) do
          {:ok, sess} ->
            for p <- [sess.conn, sess.killer], do: Process.monitor(p)
            DbWindows.set(s.id, %{account: account, state: "waiting", connection_id: sess.connection_id})
            Logger.info("sql: database window #{s.id} logged in as #{account}")
            {:reply, {:text, enc(%{"kind" => "state", "state" => "waiting", "account" => account, "connection_id" => sess.connection_id})},
             %{s | session: sess, account: account}}

          {:error, a} ->
            {:reply, {:text, enc(Map.merge(a, %{"kind" => "login_failed"}))}, s}
        end
    end
  end

  defp on(%{"kind" => "run"} = m, s) do
    st = m["statement"]
    args = Sql.args(m["args"])
    loads = Sql.loads(m["load"])
    intent = m["intent"]

    cond do
      s.id == 1 and not (is_binary(intent) and intent != "") ->
        said(m["req"], "database window 1 runs the intents' statements; it takes only db login, db exit and db cancel", s)

      args == :error -> said(m["req"], "args: up to 100 values (text, numbers, true / false, null)", s)
      match?({:error, _}, loads) -> said(m["req"], elem(loads, 1), s)
      s.id != 1 and elem(loads, 1) != [] -> said(m["req"], "books are loaded on database window 1 only (an intent's)", s)
      s.session == nil -> said(m["req"], "logged out (db login #{s.id})", s)
      s.task != nil -> said(m["req"], "a statement is running (db cancel #{s.id})", s)
      not is_binary(st) or String.trim(st) == "" -> said(m["req"], "an empty statement", s)
      byte_size(st) > @cap -> said(m["req"], "a statement up to 1 MB", s)
      not String.valid?(st) -> said(m["req"], "the statement is not UTF-8", s)
      true ->
        conn = s.session.conn
        {:ok, a} = args
        {:ok, l} = loads
        work = FsHandler.work_root()

        task =
          Task.async(fn ->
            with :ok <- Sql.load_books(conn, work, l), do: Sql.run(conn, st, a)
          end)
        DbWindows.set(s.id, %{state: "running"})
        {:reply, {:text, enc(%{"kind" => "state", "state" => "running"})}, %{s | task: {task, m["req"]}}}
    end
  end

  defp on(%{"kind" => "cancel"}, s) do
    cond do
      s.task == nil -> said("nothing is running", s)
      true ->
        case Sql.cancel(s.session.killer, s.session.connection_id) do
          :ok -> {:ok, s}
          {:error, a} -> said("cancel: " <> a["error"], s)
        end
    end
  end

  defp on(%{"kind" => "exit"}, s) do
    if s.session == nil, do: said("already logged out", s), else: logged_out("db exit", s)
  end

  defp on(_m, s), do: said("not a kind this socket takes (login, run, cancel, exit)", s)

  @impl true
  def websocket_info({ref, result}, %{task: {%Task{ref: ref}, req}} = s) do
    Process.demonitor(ref, [:flush])
    {_, a} = result
    s = %{s | task: nil}
    out = {:text, enc(Map.merge(a, %{"kind" => "answer", "req" => req || :null}))}

    if Sql.gone?(a) do
      {:reply, frames, s} = logged_out("the session ended (#{a["error"]})", s)
      {:reply, [out | frames], s}
    else
      DbWindows.set(s.id, %{state: "waiting"})
      {:reply, [out, {:text, enc(%{"kind" => "state", "state" => "waiting"})}], s}
    end
  end

  # one of the session's connections ended (the server went, or it was killed)
  def websocket_info({:DOWN, _mon, :process, pid, reason}, %{session: %{conn: c, killer: k}} = s) when pid in [c, k] do
    logged_out("the session ended (#{inspect(reason)})", s)
  end

  # the session's connections, as DBConnection tells them (the pid is its
  # inner process, not the pool held here): the first to connect for each
  # role is the session; a drop, or another process connecting (a crashed
  # one made again), would be a new session -- so it ends here
  def websocket_info({:connected, pid, {:db_session, role}}, %{session: sess} = s) when is_map(sess) do
    case Map.get(s.inner, role) do
      nil -> {:ok, %{s | inner: Map.put(s.inner, role, pid)}}
      ^pid -> {:ok, s}
      _ -> logged_out("the session ended (its connection was made again; temporary tables are gone)", s)
    end
  end

  def websocket_info({:disconnected, _pid, {:db_session, _}}, %{session: sess} = s) when is_map(sess) do
    logged_out("the session ended (its connection dropped; temporary tables are gone)", s)
  end

  def websocket_info(_msg, s), do: {:ok, s}

  defp logged_out(why, s) do
    if s.session, do: Sql.logout(s.session)
    if s.task, do: Task.shutdown(elem(s.task, 0), :brutal_kill)
    DbWindows.set(s.id, %{account: nil, state: "logged out", connection_id: nil})
    {:reply, {:text, enc(%{"kind" => "state", "state" => "logged out", "why" => why})}, %{s | session: nil, account: nil, task: nil, inner: %{}}}
  end

  @impl true
  def terminate(_reason, _req, %{session: sess}) when is_map(sess) do
    Sql.logout(sess)
    :ok
  end

  def terminate(_reason, _req, _state), do: :ok

  defp said(text, s), do: {:reply, {:text, enc(%{"kind" => "said", "error" => text})}, s}
  # a run refused: with its req, so an intent waiting for it hears
  defp said(req, text, s), do: {:reply, {:text, enc(%{"kind" => "said", "error" => text, "req" => req || :null})}, s}

  defp decode(frame) do
    case :json.decode(frame) do
      %{"kind" => k} = m when is_binary(k) -> {:ok, m}
      _ -> :error
    end
  rescue
    _ -> :error
  end

  defp enc(map), do: IO.iodata_to_binary(:json.encode(map))
end

defmodule SqlWindowsHandler do
  # GET /sql/windows -> {"windows":[{"id","account","database","state","connection_id"}]}
  # (DbWindows' ledger; the db_list panel reads it). Logging a window out is
  # that window's own (db exit <n> reaches it over the bus), so nothing here
  # changes the ledger.
  def init(req0, state) do
    origin = :cowboy_req.header("origin", req0, :undefined)

    req =
      case :cowboy_req.method(req0) do
        "GET" -> reply(200, %{"windows" => DbWindows.list()}, origin, req0)
        "OPTIONS" -> :cowboy_req.reply(204, cors(%{"vary" => "origin"}, origin), "", req0)
        _ -> reply(405, %{"error" => "method not allowed"}, origin, req0)
      end

    {:ok, req, state}
  end

  defp reply(status, map, origin, req) do
    headers = cors(%{"content-type" => "application/json; charset=utf-8", "cache-control" => "no-store", "vary" => "origin"}, origin)
    :cowboy_req.reply(status, headers, IO.iodata_to_binary(:json.encode(map)), req)
  end

  defp cors(headers, origin) do
    case AllowedOrigins.acao(origin) do
      nil -> headers
      allowed -> Map.put(headers, "access-control-allow-origin", allowed)
    end
  end
end
