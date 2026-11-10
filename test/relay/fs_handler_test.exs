

defmodule FsHandlerTest do
  use ExUnit.Case, async: false

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    {:ok, _} = Application.ensure_all_started(:inets)
    root = Path.join(System.tmp_dir!(), "fs_handler_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(root, "open/sub"))
    File.write!(Path.join(root, "open/a.txt"), "alpha")
    # the write tests' own directory, so the listing of open/ stays as it is
    File.mkdir_p!(Path.join(root, "w/sub"))
    File.write!(Path.join(root, "w/a.txt"), "alpha")
    File.mkdir_p!(Path.join(root, "locked"))
    File.chmod!(Path.join(root, "locked"), 0o000)
    prev = System.get_env("TEZCATL_FS_ROOT")
    System.put_env("TEZCATL_FS_ROOT", root)
    # the work place (the second root): not made yet -- the relay makes it
    work = root <> "_work"
    prev_work = System.get_env("TEZCATL_WORK_DIR")
    System.put_env("TEZCATL_WORK_DIR", work)

    dispatch =
      :cowboy_router.compile([
        {:_, [{"/fs", FsHandler, []}, {"/fs/read", FsHandler, []}, {"/fs/write", FsHandler, []}, {"/fs/delete", FsHandler, []}, {"/fs/rename", FsHandler, []}, {"/fs/grep", FsHandler, []}, {"/fs/stat", FsHandler, []}, {"/fs/clone", FsHandler, []}]}
      ])
    {:ok, _} = :cowboy.start_clear(:fs_handler_test, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 0}]}, %{env: %{dispatch: dispatch}})

    on_exit(fn ->
      :cowboy.stop_listener(:fs_handler_test)
      File.chmod(Path.join(root, "locked"), 0o755)
      File.rm_rf(root)
      File.rm_rf(work)
      if prev_work, do: System.put_env("TEZCATL_WORK_DIR", prev_work), else: System.delete_env("TEZCATL_WORK_DIR")
      if prev, do: System.put_env("TEZCATL_FS_ROOT", prev), else: System.delete_env("TEZCATL_FS_ROOT")
    end)

    %{port: :ranch.get_port(:fs_handler_test), root: root, work: work}
  end

  # a write / delete / rename; headers is [{name, value}] (the base check's x-tezcatl-base)
  defp change(port, method, route, query, headers \\ [], body \\ "") do
    url = ~c"http://127.0.0.1:#{port}#{route}?#{URI.encode_query(query)}"
    hs = for {k, v} <- [{"origin", "http://127.0.0.1:4001"} | headers], do: {String.to_charlist(k), String.to_charlist(v)}

    request =
      case method do
        :delete -> {url, hs}
        _ -> {url, hs, ~c"text/plain", body}
      end

    {:ok, {{_, code, _}, _headers, resp}} = :httpc.request(method, request, [], body_format: :binary)
    {code, :json.decode(resp)}
  end

  defp sha(text), do: "sha256:" <> (:crypto.hash(:sha256, text) |> Base.encode16(case: :lower))

  defp get(port, path) do
    url = ~c"http://127.0.0.1:#{port}/fs?path=#{URI.encode_www_form(path)}"
    {:ok, {{_, code, _}, _headers, body}} = :httpc.request(:get, {url, []}, [], body_format: :binary)
    {code, :json.decode(body)}
  end

  test "a directory lists its entries, directories first", %{port: port} do
    assert {200, %{"path" => "open", "entries" => [%{"name" => "sub", "dir" => true}, %{"name" => "a.txt", "size" => 5}]}} = get(port, "open")
  end

  test "a directory that cannot be read is a 403 in JSON, not a crash", %{port: port} do
    # (root can read anything: the case only exists for an ordinary user)
    if System.get_env("USER") != "root" do
      assert {403, %{"error" => "permission denied"}} = get(port, "locked")
    end
  end

  test "a missing path is a 404 in JSON", %{port: port} do
    assert {404, %{"error" => _}} = get(port, "nope")
  end

  # -- writes: the base check, no parent, delete, rename ----------

  test "a write with the base of what is on disk goes through; with another base it is refused", %{port: port, root: root} do
    f = Path.join(root, "w/w.txt")
    File.write!(f, "one")
    assert {200, %{"ok" => true}} = change(port, :put, "/fs/write", %{path: "w/w.txt"}, [{"x-tezcatl-base", sha("one")}], "two")
    assert File.read!(f) == "two"
    # someone else changed it since "one" was opened
    assert {409, %{"code" => "changed", "current" => current}} = change(port, :put, "/fs/write", %{path: "w/w.txt"}, [{"x-tezcatl-base", sha("one")}], "three")
    assert current == sha("two")
    assert File.read!(f) == "two"
    # no header (:w!, the lists' data files): last write wins as before
    assert {200, _} = change(port, :put, "/fs/write", %{path: "w/w.txt"}, [], "four")
    assert File.read!(f) == "four"
  end

  test "a file on disk that cannot be read is refused as unreadable, not as changed (2026-10-09)", %{port: port, root: root} do
    # (root can read anything: the case only exists for an ordinary user)
    if System.get_env("USER") != "root" do
      f = Path.join(root, "w/locked.txt")
      File.write!(f, "one")
      File.chmod!(f, 0o200)
      assert {409, %{"code" => "unreadable", "error" => err}} = change(port, :put, "/fs/write", %{path: "w/locked.txt"}, [{"x-tezcatl-base", sha("one")}], "two")
      assert err =~ "eacces"
      File.chmod!(f, 0o600)
      assert File.read!(f) == "one"
    end
  end

  test "a write replaces the file whole: its mode is kept, a symlink is written through, no temporary file is left (2026-10-09)", %{port: port, root: root} do
    f = Path.join(root, "w/atomic.sh")
    File.write!(f, "one")
    File.chmod!(f, 0o750)
    assert {200, _} = change(port, :put, "/fs/write", %{path: "w/atomic.sh"}, [{"x-tezcatl-base", sha("one")}], "two")
    assert File.read!(f) == "two"
    assert Bitwise.band(File.stat!(f).mode, 0o777) == 0o750
    link = Path.join(root, "w/link.sh")
    File.ln_s!("atomic.sh", link)
    assert {200, _} = change(port, :put, "/fs/write", %{path: "w/link.sh"}, [], "three")
    assert {:ok, _} = File.read_link(link)
    assert File.read!(f) == "three"
    refute Enum.any?(File.ls!(Path.join(root, "w")), &String.ends_with?(&1, ".tmp"))
  end

  test "a UTF-8 BOM on disk is not counted (the browser's text() drops it)", %{port: port, root: root} do
    File.write!(Path.join(root, "w/bom.txt"), <<0xEF, 0xBB, 0xBF>> <> "x")
    assert {200, _} = change(port, :put, "/fs/write", %{path: "w/bom.txt"}, [{"x-tezcatl-base", sha("x")}], "y")
  end

  test "base absent: a new file is made; one that exists already is refused", %{port: port, root: root} do
    assert {200, _} = change(port, :put, "/fs/write", %{path: "w/new.txt"}, [{"x-tezcatl-base", "absent"}], "n")
    assert File.read!(Path.join(root, "w/new.txt")) == "n"
    assert {409, %{"code" => "changed", "current" => "sha256:" <> _}} =
             change(port, :put, "/fs/write", %{path: "w/new.txt"}, [{"x-tezcatl-base", "absent"}], "m")
    # and a file deleted since it was opened is "absent" on disk
    assert {409, %{"code" => "changed", "current" => "absent"}} =
             change(port, :put, "/fs/write", %{path: "w/gone.txt"}, [{"x-tezcatl-base", sha("old")}], "m")
  end

  test "no file is written into a directory that does not exist", %{port: port, root: root} do
    assert {404, %{"code" => "no_parent", "error" => "no such directory: w/nodir"}} =
             change(port, :put, "/fs/write", %{path: "w/nodir/x.txt"}, [], "x")
    refute File.exists?(Path.join(root, "w/nodir"))
  end

  test "delete: a regular file, with the same base check", %{port: port, root: root} do
    f = Path.join(root, "w/d.txt")
    File.write!(f, "d")
    assert {409, %{"code" => "changed"}} = change(port, :delete, "/fs/delete", %{path: "w/d.txt"}, [{"x-tezcatl-base", sha("other")}])
    assert File.exists?(f)
    assert {200, %{"ok" => true, "path" => "w/d.txt"}} = change(port, :delete, "/fs/delete", %{path: "w/d.txt"}, [{"x-tezcatl-base", sha("d")}])
    refute File.exists?(f)
    assert {404, _} = change(port, :delete, "/fs/delete", %{path: "w/d.txt"})
    assert {400, %{"error" => "not a regular file"}} = change(port, :delete, "/fs/delete", %{path: "w/sub"})
    assert {400, %{"error" => "path escapes the root"}} = change(port, :delete, "/fs/delete", %{path: "../x"})
  end

  test "rename: to a path that does not exist, in an existing directory", %{port: port, root: root} do
    File.write!(Path.join(root, "w/r.txt"), "r")
    assert {200, %{"ok" => true, "to" => "w/sub/r2.txt"}} = change(port, :post, "/fs/rename", %{path: "w/r.txt", to: "w/sub/r2.txt"})
    assert File.read!(Path.join(root, "w/sub/r2.txt")) == "r"
    refute File.exists?(Path.join(root, "w/r.txt"))
    assert {409, %{"code" => "exists"}} = change(port, :post, "/fs/rename", %{path: "w/sub/r2.txt", to: "w/a.txt"})
    assert {404, %{"code" => "no_parent"}} = change(port, :post, "/fs/rename", %{path: "w/sub/r2.txt", to: "w/none/r.txt"})
    assert {400, _} = change(port, :post, "/fs/rename", %{path: "w/sub/r2.txt", to: "../out.txt"})
    assert {400, _} = change(port, :post, "/fs/rename", %{path: "w/sub/r2.txt"})
  end

  # -- reads: only UTF-8 text is given out ---------------

  defp read(port, path) do
    url = ~c"http://127.0.0.1:#{port}/fs/read?path=#{URI.encode_www_form(path)}"
    {:ok, {{_, code, _}, _headers, body}} = :httpc.request(:get, {url, []}, [], body_format: :binary)
    {code, body}
  end

  test "a read gives UTF-8 text as it is on disk (a BOM, CRLF and Japanese kept)", %{port: port, root: root} do
    text = <<0xEF, 0xBB, 0xBF>> <> "日本語\r\n"
    File.write!(Path.join(root, "w/u.txt"), text)
    assert {200, ^text} = read(port, "w/u.txt")
  end

  test "a file that is not UTF-8 (another encoding, a binary) is refused with not_utf8", %{port: port, root: root} do
    # Latin-1 "café"; the browser would read U+FFFD for the é and write it back so
    File.write!(Path.join(root, "w/l1.txt"), <<"caf", 0xE9, "\n">>)
    File.write!(Path.join(root, "w/b.bin"), <<0x89, "PNG", 0x0D, 0x0A, 0x1A, 0x0A, 0, 0xFF>>)
    for f <- ["w/l1.txt", "w/b.bin"] do
      assert {415, body} = read(port, f)
      assert %{"code" => "not_utf8", "error" => _} = :json.decode(body)
    end
  end

  # -- GET /fs/grep ----------------------------------------

  defp grep(port, query) do
    url = ~c"http://127.0.0.1:#{port}/fs/grep?#{URI.encode_query(query)}"
    {:ok, {{_, code, _}, _headers, body}} = :httpc.request(:get, {url, []}, [], body_format: :binary)
    {code, :json.decode(body)}
  end

  test "grep: the matches under a path, from the FS root, line and col 1-based (col in characters)", %{port: port, root: root} do
    if System.find_executable("rg") do
      File.mkdir_p!(Path.join(root, "g/sub"))
      File.write!(Path.join(root, "g/a.txt"), "first\n日本 needle here\n")
      File.write!(Path.join(root, "g/sub/b.ex"), "def needle, do: :ok\n")
      File.write!(Path.join(root, "g/other.txt"), "Needle\n")
      assert {200, %{"matches" => ms, "truncated" => false}} = grep(port, %{q: "needle", path: "g"})
      found = ms |> Enum.map(&{&1["path"], &1["line"], &1["col"]}) |> Enum.sort()
      # smart case: all lower case ignores case
      assert found == [{"g/a.txt", 2, 4}, {"g/other.txt", 1, 1}, {"g/sub/b.ex", 1, 5}]
      assert Enum.find(ms, &(&1["path"] == "g/a.txt"))["text"] == "日本 needle here"
      # upper case in the pattern: case counts
      assert {200, %{"matches" => [%{"path" => "g/other.txt"}]}} = grep(port, %{q: "Needle", path: "/g"})
      # the limit
      assert {200, %{"matches" => [_], "truncated" => true}} = grep(port, %{q: "needle", path: "g", limit: "1"})
      # nothing found, a bad pattern, a path outside the root, no pattern
      assert {200, %{"matches" => []}} = grep(port, %{q: "zzzz", path: "g"})
      assert {400, %{"code" => "rg"}} = grep(port, %{q: "(", path: "g"})
      assert {400, _} = grep(port, %{q: "x", path: "../"})
      assert {400, _} = grep(port, %{q: "", path: "g"})
    end
  end

  # -- GET /fs/stat ----------------------------------------

  defp stat(port, path) do
    url = ~c"http://127.0.0.1:#{port}/fs/stat?path=#{URI.encode_www_form(path)}"
    {:ok, {{_, code, _}, _headers, body}} = :httpc.request(:get, {url, []}, [], body_format: :binary)
    {code, :json.decode(body)}
  end

  test "stat: size, mtime and the base a write would be checked against; a missing file is absent", %{port: port, root: root} do
    f = Path.join(root, "w/s.txt")
    File.write!(f, <<0xEF, 0xBB, 0xBF>> <> "stat")
    assert {200, %{"path" => "w/s.txt", "exists" => true, "size" => 7, "mtime" => mtime, "base" => base}} = stat(port, "w/s.txt")
    # the BOM is not counted, as in x-tezcatl-base
    assert base == sha("stat")
    assert mtime == File.stat!(f, time: :posix).mtime
    assert {200, %{"exists" => false, "base" => "absent"}} = stat(port, "w/none.txt")
    assert {400, %{"error" => "not a regular file"}} = stat(port, "w/sub")
    assert {400, %{"error" => "path escapes the root"}} = stat(port, "../x")
  end

  # -- the work place: "~work/..." is the second root -----

  test "the work place: written (its directories made), read, listed, stat'ed and deleted as any file", %{port: port, root: root, work: work} do
    assert {200, %{"ok" => true, "path" => "~work/clone/lib/a.ex"}} =
             change(port, :put, "/fs/write", %{path: "~work/clone/lib/a.ex"}, [{"x-tezcatl-base", "absent"}], "clone")
    assert File.read!(Path.join(work, "clone/lib/a.ex")) == "clone"
    # nothing of it under the FS root
    refute File.exists?(Path.join(root, "~work"))
    assert {200, "clone"} = read(port, "~work/clone/lib/a.ex")
    assert {200, %{"path" => "~work/clone/lib", "root" => ^work, "entries" => [%{"name" => "a.ex"}]}} = get(port, "~work/clone/lib")
    assert {200, %{"entries" => [%{"name" => "clone", "dir" => true} | _]}} = get(port, "~work")
    assert {200, %{"exists" => true, "base" => base}} = stat(port, "~work/clone/lib/a.ex")
    assert base == sha("clone")
    assert {409, %{"code" => "changed"}} = change(port, :put, "/fs/write", %{path: "~work/clone/lib/a.ex"}, [{"x-tezcatl-base", sha("other")}], "x")
    assert {200, _} = change(port, :delete, "/fs/delete", %{path: "~work/clone/lib/a.ex"})
    refute File.exists?(Path.join(work, "clone/lib/a.ex"))
  end

  test "the work place: no way out of it, and no rename across the two roots", %{port: port, root: root, work: work} do
    assert {400, %{"error" => "path escapes the root"}} = change(port, :put, "/fs/write", %{path: "~work/../x.txt"}, [], "x")
    refute File.exists?(Path.join(Path.dirname(work), "x.txt"))
    assert {200, _} = change(port, :put, "/fs/write", %{path: "~work/scratch"}, [], "s")
    assert {400, %{"code" => "across_roots"}} = change(port, :post, "/fs/rename", %{path: "~work/scratch", to: "w/scratch.txt"})
    assert {400, %{"code" => "across_roots"}} = change(port, :post, "/fs/rename", %{path: "w/a.txt", to: "~work/a.txt"})
    assert File.read!(Path.join(root, "w/a.txt")) == "alpha"
    assert {200, _} = change(port, :post, "/fs/rename", %{path: "~work/scratch", to: "~work/scratch2"})
    assert File.read!(Path.join(work, "scratch2")) == "s"
    # the FS root's directories are still never made
    assert {404, %{"code" => "no_parent"}} = change(port, :put, "/fs/write", %{path: "w/nodir2/x.txt"}, [], "x")
  end

  # -- POST /fs/clone ---------------------------------------

  test "clone: the file as it is on disk, copied into the work place under its own path", %{port: port, root: root, work: work} do
    File.mkdir_p!(Path.join(root, "c/lib"))
    text = <<0xEF, 0xBB, 0xBF>> <> "defmodule A do\r\nend\r\n"
    File.write!(Path.join(root, "c/lib/a.ex"), text)
    assert {200, %{"ok" => true, "to" => "~work/clone/c/lib/a.ex", "dropped" => []}} = change(port, :post, "/fs/clone", %{path: "c/lib/a.ex"})
    assert File.read!(Path.join(work, "clone/c/lib/a.ex")) == text
    # the original is untouched; cloned again, the clone is written over
    assert File.read!(Path.join(root, "c/lib/a.ex")) == text
    File.write!(Path.join(root, "c/lib/a.ex"), "two")
    assert {200, %{"to" => "~work/clone/c/lib/a.ex"}} = change(port, :post, "/fs/clone", %{path: "c/lib/a.ex"})
    assert File.read!(Path.join(work, "clone/c/lib/a.ex")) == "two"
    assert {404, _} = change(port, :post, "/fs/clone", %{path: "c/none.ex"})
    assert {400, %{"error" => "not a regular file"}} = change(port, :post, "/fs/clone", %{path: "c/lib"})
    assert {400, %{"error" => "a file of the work place is not cloned"}} = change(port, :post, "/fs/clone", %{path: "~work/clone/c/lib/a.ex"})
    assert {400, %{"error" => "path escapes the root"}} = change(port, :post, "/fs/clone", %{path: "../x"})
  end

  test "clone: at most `slots` are kept, the ones written longest ago dropped with the directories they leave empty", %{work: work} do
    dir = Path.join(work, "clone_prune")
    for {name, age} <- [{"old/deep/a.ex", 300}, {"b.ex", 200}, {"c.ex", 100}, {"new.ex", 0}] do
      f = Path.join(dir, name)
      File.mkdir_p!(Path.dirname(f))
      File.write!(f, name)
      File.touch!(f, System.os_time(:second) - age)
    end
    new = Path.join(dir, "new.ex")
    assert FsHandler.prune_clones(dir, new, 2) == [Path.join(dir, "b.ex"), Path.join(dir, "old/deep/a.ex")]
    assert Enum.sort(File.ls!(dir)) == ["c.ex", "new.ex"]
    # the one just made is never dropped, even when it is not the newest by the clock
    File.touch!(new, System.os_time(:second) - 1000)
    assert FsHandler.prune_clones(dir, new, 1) == []
    assert Enum.sort(File.ls!(dir)) == ["c.ex", "new.ex"]
  end

  test "a change from a page of another origin is refused", %{port: port} do
    url = ~c"http://127.0.0.1:#{port}/fs/delete?path=open/a.txt"
    {:ok, {{_, code, _}, _, _}} = :httpc.request(:delete, {url, [{~c"origin", ~c"http://evil.example"}]}, [], [])
    assert code == 403
  end
end
