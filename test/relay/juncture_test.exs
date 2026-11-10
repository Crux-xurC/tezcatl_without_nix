

# /juncture: the points kept of a file, as a tree (D-juncture)
defmodule JunctureTest do
  use ExUnit.Case, async: false

  @routes ~w(/juncture/set /juncture/point /juncture/current /juncture/tree /juncture/list)

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    {:ok, _} = Application.ensure_all_started(:inets)
    base = Path.join(System.tmp_dir!(), "juncture_test_#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(base, "root"))
    prev = {System.get_env("TEZCATL_FS_ROOT"), System.get_env("TEZCATL_WORK_DIR")}
    System.put_env("TEZCATL_FS_ROOT", Path.join(base, "root"))
    System.put_env("TEZCATL_WORK_DIR", Path.join(base, "work"))

    dispatch = :cowboy_router.compile([{:_, Enum.map(@routes, &{&1, JunctureHandler, []})}])
    {:ok, _} = :cowboy.start_clear(:juncture_test, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 0}]}, %{env: %{dispatch: dispatch}})

    on_exit(fn ->
      :cowboy.stop_listener(:juncture_test)
      File.rm_rf(base)
      {r, w} = prev
      if r, do: System.put_env("TEZCATL_FS_ROOT", r), else: System.delete_env("TEZCATL_FS_ROOT")
      if w, do: System.put_env("TEZCATL_WORK_DIR", w), else: System.delete_env("TEZCATL_WORK_DIR")
    end)

    %{port: :ranch.get_port(:juncture_test), work: Path.join(base, "work")}
  end

  # each test starts from a relay just started (the store throws everything
  # away). Not linked: a store linked to the test before would be stopped
  # when that test's process ends -- in the middle of the next test.
  setup do
    restart()
    :ok
  end

  defp restart do
    if pid = Process.whereis(JunctureStore), do: GenServer.stop(pid)
    {:ok, _} = GenServer.start(JunctureStore, :ok, name: JunctureStore)
  end

  defp req(port, method, route, query, body \\ "", origin \\ "http://127.0.0.1:4001") do
    url = ~c"http://127.0.0.1:#{port}#{route}?#{URI.encode_query(query)}"
    hs = if origin, do: [{~c"origin", String.to_charlist(origin)}], else: []
    request = if method == :post, do: {url, hs, ~c"text/plain", body}, else: {url, hs}
    {:ok, {{_, code, _}, _h, resp}} = :httpc.request(method, request, [], body_format: :binary)
    {code, :json.decode(resp)}
  end

  defp set(port, path, text, files \\ 10), do: req(port, :post, "/juncture/set", %{path: path, files: files}, text)
  defp point(port, path, text, q \\ %{}), do: req(port, :post, "/juncture/point", Map.merge(%{path: path}, q), text)
  defp tree(port, path), do: req(port, :get, "/juncture/tree", %{path: path})
  defp current(port, path, to), do: req(port, :post, "/juncture/current", %{path: path, to: to})

  # the text of a point, read where /fs would (~work/... under the work place)
  defp text_of(work, t, id) do
    "~work/" <> rest = t["nodes"][id]["text"]
    File.read!(Path.join(work, rest))
  end

  test "set: the start, j0 (the ancestor); set again does nothing", %{port: port, work: work} do
    assert {200, %{"ok" => true, "created" => true, "id" => "j0", "dropped" => []}} = set(port, "/p/a.ex", "one\n")
    assert {200, %{"created" => false, "id" => "j0"}} = set(port, "p/a.ex", "other\n")
    assert {200, %{"path" => "p/a.ex", "current" => "j0", "nodes" => %{"j0" => j0} = nodes} = t} = tree(port, "p/a.ex")
    assert map_size(nodes) == 1
    assert j0["parent"] == :null and j0["ancestor"] == true
    assert String.starts_with?(j0["text"], "~work/juncture/files/") and String.ends_with?(j0["text"], "/j0-a.ex")
    assert text_of(work, t, "j0") == "one\n"
  end

  test "point: a child of the current point; the same text makes none; an unset file is set first", %{port: port, work: work} do
    assert {200, %{"id" => "j0", "created" => true}} = point(port, "p/a.ex", "0")
    assert {200, %{"id" => "j1", "same" => false}} = point(port, "p/a.ex", "1")
    assert {200, %{"id" => "j1", "same" => true}} = point(port, "p/a.ex", "1")
    {200, t} = tree(port, "p/a.ex")
    assert t["current"] == "j1"
    assert t["nodes"]["j1"]["parent"] == "j0" and t["nodes"]["j1"]["ancestor"] == false
    assert t["nodes"]["j0"]["lastChild"] == "j1"
    assert text_of(work, t, "j1") == "1"
  end

  test "back and a new point make a branch; forward follows the way last taken", %{port: port} do
    for x <- ~w(0 1 2), do: point(port, "p/a.ex", x)
    assert {200, %{"ok" => true}} = current(port, "p/a.ex", "j1")
    assert {200, %{"id" => "j3"}} = point(port, "p/a.ex", "3")
    {200, t} = tree(port, "p/a.ex")
    assert t["nodes"]["j3"]["parent"] == "j1"
    assert t["nodes"]["j1"]["lastChild"] == "j3"
    # choosing j2 (a point of the other branch) makes the way go there again
    assert {200, _} = current(port, "p/a.ex", "j2")
    {200, t} = tree(port, "p/a.ex")
    assert t["current"] == "j2" and t["nodes"]["j1"]["lastChild"] == "j2"
    assert {404, %{"code" => "no_point"}} = current(port, "p/a.ex", "j9")
  end

  test "past slots the oldest point goes, never j0; its children hang on its parent", %{port: port, work: work} do
    for x <- ~w(0 1 2), do: point(port, "p/a.ex", x)
    assert {200, %{"id" => "j3", "dropped_points" => ["j1"]}} = point(port, "p/a.ex", "3", %{slots: 3})
    {200, t} = tree(port, "p/a.ex")
    assert Map.keys(t["nodes"]) |> Enum.sort() == ["j0", "j2", "j3"]
    assert t["nodes"]["j2"]["parent"] == "j0"
    assert [] = Path.wildcard(Path.join(work, "juncture/files/*/j1-a.ex"))
  end

  test "past slots a branching point goes too: its children stay siblings under its parent", %{port: port} do
    # j0 - j1 - j2
    #         \- j3     (j1 branches; j3 current)
    for x <- ~w(0 1 2), do: point(port, "p/a.ex", x)
    current(port, "p/a.ex", "j1")
    point(port, "p/a.ex", "3")
    assert {200, %{"id" => "j4", "dropped_points" => ["j1"]}} = point(port, "p/a.ex", "4", %{slots: 4})
    {200, t} = tree(port, "p/a.ex")
    assert t["nodes"]["j2"]["parent"] == "j0" and t["nodes"]["j3"]["parent"] == "j0"
    # j0's way went through j1: it goes on to j1's way (j3)
    assert t["nodes"]["j0"]["lastChild"] == "j3"
    assert Enum.count(t["nodes"], fn {_, n} -> n["parent"] == :null end) == 1
  end

  test "past slots: several go in a row; a parent whose way went through a point that goes follows its way", %{port: port} do
    # j0 - j1 - j2 - j3      j2's way: j3 (visited last)
    #         |    \- j4
    #         \- j5          (current)
    for x <- ~w(0 1 2 3), do: point(port, "p/a.ex", x)
    current(port, "p/a.ex", "j2")
    point(port, "p/a.ex", "4")
    current(port, "p/a.ex", "j3")
    current(port, "p/a.ex", "j1")
    # j1 and j2 go first (oldest), then j3
    assert {200, %{"id" => "j5", "dropped_points" => ["j1", "j2", "j3"]}} = point(port, "p/a.ex", "5", %{slots: 3})
    {200, t} = tree(port, "p/a.ex")
    assert Map.keys(t["nodes"]) |> Enum.sort() == ["j0", "j4", "j5"]
    assert t["nodes"]["j4"]["parent"] == "j0" and t["nodes"]["j5"]["parent"] == "j0"
    assert t["nodes"]["j0"]["lastChild"] == "j5"
  end

  test "past files the tree touched longest ago goes, said in dropped", %{port: port, work: work} do
    set(port, "p/a.ex", "a")
    set(port, "p/b.ex", "b")
    point(port, "p/a.ex", "a2")
    assert {200, %{"created" => true, "dropped" => ["p/b.ex"]}} = set(port, "p/c.ex", "c", 2)
    assert {404, %{"code" => "not_set"}} = tree(port, "p/b.ex")
    assert [] = Path.wildcard(Path.join(work, "juncture/files/*-b.ex"))
    {200, %{"files" => files}} = req(port, :get, "/juncture/list", %{})
    assert Enum.map(files, & &1["path"]) == ["p/c.ex", "p/a.ex"]
  end

  test "a relay that starts throws the junctures away", %{port: port, work: work} do
    set(port, "p/a.ex", "a")
    assert File.exists?(Path.join(work, "juncture/index.json"))
    restart()
    refute File.exists?(Path.join(work, "juncture"))
    assert {404, %{"code" => "not_set"}} = tree(port, "p/a.ex")
  end

  test "refused: another Origin, a path out of the root, the work place", %{port: port} do
    url = ~c"http://127.0.0.1:#{port}/juncture/set?path=p/a.ex"
    {:ok, {{_, 403, _}, _, _}} = :httpc.request(:post, {url, [{~c"origin", ~c"http://evil.example"}], ~c"text/plain", "x"}, [], [])
    assert {400, _} = set(port, "../x.ex", "x")
    assert {400, _} = set(port, "~work/scratch", "x")
    assert {404, %{"code" => "not_set"}} = tree(port, "p/none.ex")
  end
end
