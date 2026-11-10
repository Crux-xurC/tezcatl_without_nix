

# /ids: the id lists `:Replace <mark> <list>` takes ids from (D-id-pool)
defmodule IdPoolTest do
  use ExUnit.Case, async: false

  setup_all do
    {:ok, _} = Application.ensure_all_started(:cowboy)
    {:ok, _} = Application.ensure_all_started(:inets)
    base = Path.join(System.tmp_dir!(), "id_pool_test_#{System.unique_integer([:positive])}")
    prev = System.get_env("TEZCATL_IDS_DIR")
    System.put_env("TEZCATL_IDS_DIR", base)
    # not linked to the setup process: it outlives it
    {:ok, _} = GenServer.start(IdPool, :ok, name: IdPool)

    dispatch = :cowboy_router.compile([{:_, [{"/ids/take", IdPoolHandler, []}]}])
    {:ok, _} = :cowboy.start_clear(:id_pool_test, %{socket_opts: [{:ip, {127, 0, 0, 1}}, {:port, 0}]}, %{env: %{dispatch: dispatch}})

    on_exit(fn ->
      :cowboy.stop_listener(:id_pool_test)
      File.rm_rf(base)
      if prev, do: System.put_env("TEZCATL_IDS_DIR", prev), else: System.delete_env("TEZCATL_IDS_DIR")
    end)

    %{port: :ranch.get_port(:id_pool_test), dir: base}
  end

  defp take(port, q, origin \\ "http://127.0.0.1:4001") do
    url = ~c"http://127.0.0.1:#{port}/ids/take?#{URI.encode_query(q)}"
    hs = if origin, do: [{~c"origin", String.to_charlist(origin)}], else: []
    {:ok, {{_, code, _}, _h, resp}} = :httpc.request(:post, {url, hs, ~c"text/plain", ""}, [], body_format: :binary)
    {code, (try do :json.decode(resp) rescue _ -> resp end)}
  end

  defp doc(dir, list), do: :json.decode(File.read!(Path.join(dir, list <> ".json")))

  test "a list made at first use: n ids of 8 [0-9a-z], issued with the file, available filled up again", %{port: port, dir: dir} do
    assert {200, %{"ok" => true, "ids" => ids}} = take(port, %{list: "first", n: 3, path: "notes/a.md", keep: 10})
    assert length(ids) == 3 and Enum.all?(ids, &Regex.match?(~r/\A[0-9a-z]{8}\z/, &1))
    assert length(Enum.uniq(ids)) == 3
    d = doc(dir, "first")
    assert length(d["available"]) == 10
    assert Enum.all?(ids, fn id -> d["issued"][id]["path"] == "notes/a.md" and is_integer(d["issued"][id]["at"]) end)
    assert MapSet.disjoint?(MapSet.new(ids), MapSet.new(d["available"]))
  end

  test "taken from the top, in order; never handed out twice", %{port: port, dir: dir} do
    take(port, %{list: "order", n: 1, path: "x", keep: 5})
    top = Enum.take(doc(dir, "order")["available"], 2)
    assert {200, %{"ids" => ^top}} = take(port, %{list: "order", n: 2, path: "y", keep: 5})
    seen =
      Enum.reduce(1..30, MapSet.new(top), fn _, acc ->
        {200, %{"ids" => ids}} = take(port, %{list: "order", n: 4, path: "z", keep: 5})
        assert MapSet.disjoint?(acc, MapSet.new(ids))
        MapSet.union(acc, MapSet.new(ids))
      end)
    assert MapSet.size(seen) == 122
    assert map_size(doc(dir, "order")["issued"]) == 123
  end

  test "more than kept: still n ids", %{port: port} do
    assert {200, %{"ids" => ids}} = take(port, %{list: "many", n: 50, path: "x", keep: 5})
    assert length(Enum.uniq(ids)) == 50
  end

  test "refused: a bad name, a bad n, another Origin; a list that cannot be read is not written over", %{port: port, dir: dir} do
    assert {400, _} = take(port, %{list: "../x", n: 1, path: "x"})
    assert {400, _} = take(port, %{list: "Upper", n: 1, path: "x"})
    assert {400, _} = take(port, %{list: "ok", n: 0, path: "x"})
    assert {400, _} = take(port, %{list: "ok", n: 1001, path: "x"})
    assert {403, _} = take(port, %{list: "ok", n: 1, path: "x"}, "http://evil.example")
    File.mkdir_p!(dir)
    File.write!(Path.join(dir, "broken.json"), "{not json")
    assert {500, %{"code" => "not_written"}} = take(port, %{list: "broken", n: 1, path: "x"})
    assert File.read!(Path.join(dir, "broken.json")) == "{not json"
  end
end
