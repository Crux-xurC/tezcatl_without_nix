

# /mirror: the slots of the copies code_editor keeps
defmodule MirrorTest do
  use ExUnit.Case, async: false

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    {:ok, _} = Application.ensure_all_started(:inets)
    base = Path.join(System.tmp_dir!(), "mirror_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(base, "root"))
    prev = {System.get_env("TEZCATL_FS_ROOT"), System.get_env("TEZCATL_MIRROR_DIR")}
    System.put_env("TEZCATL_FS_ROOT", Path.join(base, "root"))
    System.put_env("TEZCATL_MIRROR_DIR", Path.join(base, "mirror"))
    {:ok, _} = MirrorStore.start_link([])

    dispatch = :cowboy_router.compile([{:_, [{"/mirror", MirrorHandler, []}, {"/mirror/list", MirrorHandler, []}, {"/mirror/close", MirrorHandler, []}, {"/mirror/drop", MirrorHandler, []}]}])
    {:ok, _} = :cowboy.start_clear(:mirror_test, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 0}]}, %{env: %{dispatch: dispatch}})

    on_exit(fn ->
      :cowboy.stop_listener(:mirror_test)
      File.rm_rf(base)
      {r, m} = prev
      if r, do: System.put_env("TEZCATL_FS_ROOT", r), else: System.delete_env("TEZCATL_FS_ROOT")
      if m, do: System.put_env("TEZCATL_MIRROR_DIR", m), else: System.delete_env("TEZCATL_MIRROR_DIR")
    end)

    %{port: :ranch.get_port(:mirror_test), mirror: Path.join(base, "mirror")}
  end

  defp req(port, method, route, query, body \\ "", origin \\ "http://127.0.0.1:4001") do
    url = ~c"http://127.0.0.1:#{port}#{route}?#{URI.encode_query(query)}"
    hs = if origin, do: [{~c"origin", String.to_charlist(origin)}], else: []
    request = if method in [:put, :post], do: {url, hs, ~c"text/plain", body}, else: {url, hs}
    {:ok, {{_, code, _}, _h, resp}} = :httpc.request(method, request, [], body_format: :binary)
    {code, resp}
  end

  defp put(port, path, owner, text, mode \\ "write", slots \\ 10) do
    {code, resp} = req(port, :put, "/mirror", %{path: path, owner: owner, mode: mode, slots: slots}, text)
    {code, :json.decode(resp)}
  end

  defp list(port), do: (req(port, :get, "/mirror/list", %{}) |> elem(1) |> :json.decode())["slots"]

  test "a slot: put, get back, closed by its owner only (a copy keeps its extension, outside the project)", %{port: port, mirror: mirror} do
    assert {200, %{"ok" => true, "left" => :null}} = put(port, "p/lib/a.ex", "o1", "defmodule A do end\n", "open")
    assert {200, "defmodule A do end\n"} = req(port, :get, "/mirror", %{path: "/p/lib/a.ex"})
    assert [copy] = Path.wildcard(Path.join(mirror, "files/*-a.ex"))
    assert File.read!(copy) == "defmodule A do end\n"
    assert {200, _} = put(port, "p/lib/a.ex", "o1", "edited\n")
    assert {200, "edited\n"} = req(port, :get, "/mirror", %{path: "p/lib/a.ex"})
    # another code_editor's close does not take it
    assert {200, ~s({"ok":false,"result":"not_owner"})} = req(port, :post, "/mirror/close", %{path: "p/lib/a.ex", owner: "o2"})
    assert {200, ~s({"ok":true,"result":"ok"})} = req(port, :post, "/mirror/close", %{path: "p/lib/a.ex", owner: "o1"})
    assert {404, _} = req(port, :get, "/mirror", %{path: "p/lib/a.ex"})
    refute File.exists?(copy)
  end

  test "opening a file whose slot was left with another text keeps it, and says so", %{port: port} do
    put(port, "p/left.ex", "crashed", "unsaved work\n", "open")
    put(port, "p/left.ex", "crashed", "unsaved work, more\n")
    # a new code_editor opens the file (the disk's text): the copy stays to be replayed
    assert {200, %{"left" => %{"bytes" => 19}}} = put(port, "p/left.ex", "o-new", "on disk\n", "open")
    assert {200, "unsaved work, more\n"} = req(port, :get, "/mirror", %{path: "p/left.ex"})
    # the slot is the new code_editor's now (it is closed with it)
    assert Enum.find(list(port), &(&1["path"] == "p/left.ex"))["owner"] == "o-new"
    # the same text: nothing left to say
    assert {200, %{"left" => :null}} = put(port, "p/left.ex", "o-3", "unsaved work, more\n", "open")
    req(port, :post, "/mirror/close", %{path: "p/left.ex", owner: "o-3"})
  end

  test "past N slots the oldest opened are pushed out (writing to one does not make it new)", %{port: port} do
    for p <- ~w(n/1 n/2 n/3), do: put(port, p, "o", "x", "open", 3)
    put(port, "n/1", "o", "edited", "write", 3)
    assert {200, %{"evicted" => ["n/1"]}} = put(port, "n/4", "o", "x", "open", 3)
    assert Enum.map(list(port), & &1["path"]) |> Enum.filter(&String.starts_with?(&1, "n/")) |> Enum.sort() == ~w(n/2 n/3 n/4)
    for p <- ~w(n/2 n/3 n/4), do: req(port, :post, "/mirror/close", %{path: p, owner: "o"})
  end

  test "closed with unsaved edits: the slot stays, marked, until a code_editor opens the file again", %{port: port} do
    put(port, "u/a.ex", "o1", "on disk\n", "open")
    put(port, "u/a.ex", "o1", "unsaved edit\n")
    # another code_editor cannot mark it
    assert {200, ~s({"ok":false,"result":"not_owner"})} = req(port, :post, "/mirror/close", %{path: "u/a.ex", owner: "o2", unsaved: "1"})
    assert {200, ~s({"ok":true,"result":"kept"})} = req(port, :post, "/mirror/close", %{path: "u/a.ex", owner: "o1", unsaved: "1"})
    assert {200, "unsaved edit\n"} = req(port, :get, "/mirror", %{path: "u/a.ex"})
    assert is_integer(Enum.find(list(port), &(&1["path"] == "u/a.ex"))["unsaved_closed"])
    # opened again: the copy is left to replay, the mark goes (the slot is the new code_editor's)
    assert {200, %{"left" => %{"bytes" => 13}}} = put(port, "u/a.ex", "o3", "on disk\n", "open")
    assert Enum.find(list(port), &(&1["path"] == "u/a.ex"))["unsaved_closed"] == :null
    # a clean close still removes it
    assert {200, ~s({"ok":true,"result":"ok"})} = req(port, :post, "/mirror/close", %{path: "u/a.ex", owner: "o3"})
    assert {404, _} = req(port, :get, "/mirror", %{path: "u/a.ex"})
  end

  test "a copy left by a code_editor closed unsaved is never pushed out, nor counted (2026-10-10)", %{port: port} do
    put(port, "e/left.ex", "o1", "unsaved edit\n", "open", 3)
    assert {200, _} = req(port, :post, "/mirror/close", %{path: "e/left.ex", owner: "o1", unsaved: "1"})
    # three files being edited fit beside it; the fourth pushes out the oldest of them, not it
    # (a few ms apart: the oldest opened is pushed out, and "opened" is in ms)
    for p <- ~w(e/1 e/2 e/3), do: (Process.sleep(3); assert({200, %{"evicted" => []}} = put(port, p, "o", "x", "open", 3)))
    Process.sleep(3)
    assert {200, %{"evicted" => ["e/1"]}} = put(port, "e/4", "o", "x", "open", 3)
    assert {200, "unsaved edit\n"} = req(port, :get, "/mirror", %{path: "e/left.ex"})
    for p <- ~w(e/2 e/3 e/4), do: req(port, :post, "/mirror/close", %{path: p, owner: "o"})
    req(port, :post, "/mirror/drop", %{path: "e/left.ex"})
  end

  test "an unsaved close with text=1 writes the text at closing, and makes a pushed-out slot again", %{port: port} do
    put(port, "t/a.ex", "o1", "on disk\n", "open", 3)
    put(port, "t/a.ex", "o1", "written at rest\n", "write", 3)
    assert {200, ~s({"ok":true,"result":"kept"})} =
             req(port, :post, "/mirror/close", %{path: "t/a.ex", owner: "o1", unsaved: "1", text: "1"}, "typed just before closing\n")
    assert {200, "typed just before closing\n"} = req(port, :get, "/mirror", %{path: "t/a.ex"})
    req(port, :post, "/mirror/drop", %{path: "t/a.ex"})

    # pushed out while its code_editor was still open (more files than slots), then closed unsaved
    put(port, "t/b.ex", "o2", "on disk\n", "open", 2)
    for p <- ~w(t/1 t/2), do: (Process.sleep(3); put(port, p, "o", "x", "open", 2))
    assert {404, _} = req(port, :get, "/mirror", %{path: "t/b.ex"})
    assert {200, ~s({"ok":true,"result":"kept"})} =
             req(port, :post, "/mirror/close", %{path: "t/b.ex", owner: "o2", unsaved: "1", text: "1", slots: "2"}, "the edits\n")
    assert {200, "the edits\n"} = req(port, :get, "/mirror", %{path: "t/b.ex"})
    assert is_integer(Enum.find(list(port), &(&1["path"] == "t/b.ex"))["unsaved_closed"])
    # without the text a gone slot stays gone; a clean close never makes one
    assert {200, ~s({"ok":false,"result":"none"})} = req(port, :post, "/mirror/close", %{path: "t/c.ex", owner: "o3", unsaved: "1"})
    assert {200, ~s({"ok":false,"result":"none"})} = req(port, :post, "/mirror/close", %{path: "t/c.ex", owner: "o3", text: "1"}, "x")
    # held by another code_editor: not written
    put(port, "t/d.ex", "o4", "mine\n", "open", 10)
    assert {200, ~s({"ok":false,"result":"not_owner"})} =
             req(port, :post, "/mirror/close", %{path: "t/d.ex", owner: "o5", unsaved: "1", text: "1"}, "not mine\n")
    assert {200, "mine\n"} = req(port, :get, "/mirror", %{path: "t/d.ex"})
    req(port, :post, "/mirror/drop", %{path: "t/b.ex"})
    for p <- ~w(t/1 t/2), do: req(port, :post, "/mirror/close", %{path: p, owner: "o"})
    req(port, :post, "/mirror/close", %{path: "t/d.ex", owner: "o4"})
  end

  test "a copy left by a code_editor closed unsaved can be thrown away; one held now cannot", %{port: port} do
    put(port, "d/a.ex", "o1", "on disk\n", "open")
    put(port, "d/a.ex", "o1", "unsaved edit\n")
    # held by its code_editor: not dropped
    assert {409, body} = req(port, :post, "/mirror/drop", %{path: "d/a.ex"})
    assert body =~ "in_use"
    assert {200, _} = req(port, :post, "/mirror/close", %{path: "d/a.ex", owner: "o1", unsaved: "1"})
    # left: dropped, gone from the list and from disk
    assert {200, ~s({"ok":true,"result":"ok"})} = req(port, :post, "/mirror/drop", %{path: "d/a.ex"})
    assert {404, _} = req(port, :get, "/mirror", %{path: "d/a.ex"})
    refute Enum.any?(list(port), &(&1["path"] == "d/a.ex"))
    assert {404, _} = req(port, :post, "/mirror/drop", %{path: "d/a.ex"})
    # another origin may not
    assert {403, _} = req(port, :post, "/mirror/drop", %{path: "d/a.ex"}, "", "http://evil.example")
  end

  test "the place: TEZCATL_MIRROR_DIR, else the XDG state directory -- never the relay's cwd (2026-10-10)", %{mirror: mirror} do
    saved = {System.get_env("TEZCATL_MIRROR_DIR"), System.get_env("XDG_STATE_HOME")}

    try do
      assert MirrorStore.dir() == mirror
      System.delete_env("TEZCATL_MIRROR_DIR")
      System.put_env("XDG_STATE_HOME", "/srv/state")
      assert MirrorStore.dir() == "/srv/state/tezcatl/mirror"
      # a relative XDG_STATE_HOME is ignored (the spec), as is an empty one
      for v <- ["rel/state", ""] do
        System.put_env("XDG_STATE_HOME", v)
        assert MirrorStore.dir() == Path.expand("~/.local/state/tezcatl/mirror")
      end
      System.delete_env("XDG_STATE_HOME")
      assert MirrorStore.dir() == Path.expand("~/.local/state/tezcatl/mirror")
      refute String.starts_with?(MirrorStore.dir(), File.cwd!())
      System.put_env("TEZCATL_MIRROR_DIR", "~/m")
      assert MirrorStore.dir() == Path.expand("~/m")
    after
      {m, x} = saved
      if m, do: System.put_env("TEZCATL_MIRROR_DIR", m), else: System.delete_env("TEZCATL_MIRROR_DIR")
      if x, do: System.put_env("XDG_STATE_HOME", x), else: System.delete_env("XDG_STATE_HOME")
    end
  end

  test "the slots survive a restart (index.json is read back)", %{port: port} do
    put(port, "r/kept.txt", "o", "kept", "open")
    :ok = GenServer.stop(MirrorStore)
    # not linked to this test's process (the other tests use it afterwards)
    {:ok, _} = GenServer.start(MirrorStore, :ok, name: MirrorStore)
    assert {200, "kept"} = req(port, :get, "/mirror", %{path: "r/kept.txt"})
    req(port, :post, "/mirror/close", %{path: "r/kept.txt", owner: "o"})
  end

  test "a path outside the FS root, no owner, another origin are refused", %{port: port} do
    assert {400, _} = put(port, "../x", "o", "x")
    assert {400, _} = put(port, "", "o", "x")
    assert {400, _} = put(port, "a.txt", "", "x")
    assert {403, _} = req(port, :put, "/mirror", %{path: "a.txt", owner: "o"}, "x", "http://evil.example")
    assert {403, _} = req(port, :post, "/mirror/close", %{path: "a.txt", owner: "o"}, "", "http://evil.example")
  end

  test "copies of foo and foo/bar.ex do not get in each other's way (flat names; was a crash, 2026-10-15)", %{port: port} do
    put(port, "c/foo", "o1", "x", "open")
    assert {200, %{"result" => "kept"}} =
             (req(port, :post, "/mirror/close", %{path: "c/foo", owner: "o1", unsaved: "1"}) |> then(fn {c, b} -> {c, :json.decode(b)} end))
    # foo is a directory now, and foo/bar.ex is edited
    assert {200, %{"ok" => true}} = put(port, "c/foo/bar.ex", "o2", "bar", "open")
    assert {200, "bar"} = req(port, :get, "/mirror", %{path: "c/foo/bar.ex"})
    assert {200, "x"} = req(port, :get, "/mirror", %{path: "c/foo"})
    req(port, :post, "/mirror/drop", %{path: "c/foo"})
    req(port, :post, "/mirror/close", %{path: "c/foo/bar.ex", owner: "o2"})
  end

  test "a copy that cannot be written is a 500, and the store stays up (2026-10-15)", %{port: port, mirror: mirror} do
    files = Path.join(mirror, "files")
    File.mkdir_p!(files)
    pid = Process.whereis(MirrorStore)
    File.chmod!(files, 0o500)

    try do
      for i <- 1..5 do
        assert {500, %{"code" => "not_written"}} = put(port, "w/a.txt", "o", "t#{i}", "open")
      end

      assert Process.whereis(MirrorStore) == pid
    after
      File.chmod!(files, 0o700)
    end

    assert {200, %{"ok" => true}} = put(port, "w/a.txt", "o", "ok", "open")
    req(port, :post, "/mirror/close", %{path: "w/a.txt", owner: "o"})
  end

  test "a slot from before flat names (its copy at files/<path>) is moved on start", %{port: port, mirror: mirror} do
    old = Path.join(mirror, "files/l/old.txt")
    File.mkdir_p!(Path.dirname(old))
    File.write!(old, "old copy")
    idx = Path.join(mirror, "index.json")
    # index.json is there only after another test's put (any order: --seed)
    slots = if File.exists?(idx), do: :json.decode(File.read!(idx))["slots"], else: %{}
    slots = Map.put(slots, "l/old.txt", %{"owner" => "o", "opened" => 1, "updated" => 1, "unsaved_closed" => 1})
    File.write!(idx, IO.iodata_to_binary(:json.encode(%{"slots" => slots})))
    :ok = GenServer.stop(MirrorStore)
    {:ok, _} = GenServer.start(MirrorStore, :ok, name: MirrorStore)
    assert {200, "old copy"} = req(port, :get, "/mirror", %{path: "l/old.txt"})
    refute File.exists?(old)
    req(port, :post, "/mirror/drop", %{path: "l/old.txt"})
  end
end
