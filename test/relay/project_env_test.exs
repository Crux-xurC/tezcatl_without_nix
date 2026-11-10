

defmodule ProjectEnvConfigTest do
  use ExUnit.Case, async: true

  describe "normalize/1" do
    test "entries in order, format env by default, timeout default 120 s" do
      {:ok, cfg} =
        ProjectEnvConfig.normalize(%{
          "entries" => [
            %{"marker" => "flake.nix", "command" => ["nix", "print-dev-env", "--json"], "format" => "nix"},
            %{"marker" => ".envrc", "command" => ["direnv", "export", "json"]}
          ]
        })

      assert cfg.timeout_ms == 120_000
      assert [%{marker: "flake.nix", format: "nix"}, %{marker: ".envrc", format: "env"}] = cfg.entries
      assert cfg.problems == []
    end

    test "broken entries are dropped and said; a broken top level is an error" do
      {:ok, cfg} =
        ProjectEnvConfig.normalize(%{
          "entries" => [
            %{"marker" => "a/b", "command" => ["x"]},
            %{"marker" => "m", "command" => []},
            %{"marker" => "m", "command" => ["x"], "format" => "yaml"},
            "no",
            %{"marker" => "ok", "command" => ["x"]}
          ]
        })

      assert [%{marker: "ok"}] = cfg.entries
      assert length(cfg.problems) == 4
      assert {:error, _} = ProjectEnvConfig.normalize(%{"entries" => %{}})
      assert {:error, _} = ProjectEnvConfig.normalize(%{"timeoutMs" => 0})
      assert {:error, _} = ProjectEnvConfig.normalize([])
    end

    test "no project_env.json is no entries" do
      dir = tmp!()
      assert {:ok, %{entries: []}} = ProjectEnvConfig.read(dir)
      File.write!(Path.join(dir, "project_env.json"), "{")
      assert {:error, "project_env.json is not valid JSON"} = ProjectEnvConfig.read(dir)
    end
  end

  describe "locate/3" do
    setup do
      root = tmp!()
      File.mkdir_p!(Path.join(root, "p/sub/deep"))
      File.mkdir_p!(Path.join(root, "q"))
      File.write!(Path.join(root, "p/flake.nix"), "")
      File.write!(Path.join(root, "p/.envrc"), "")
      %{root: root}
    end

    @entries [%{marker: ".envrc", command: ["direnv"], format: "env"}, %{marker: "flake.nix", command: ["nix"], format: "nix"}]

    test "the nearest directory with a marker; there the first entry in order", %{root: root} do
      p = Path.join(root, "p")
      assert {:ok, ^p, %{marker: ".envrc"}} = ProjectEnvConfig.locate(Path.join(root, "p/sub/deep"), @entries, root)
      assert {:ok, ^p, %{marker: "flake.nix"}} = ProjectEnvConfig.locate(p, Enum.reverse(@entries), root)
    end

    test "none up to the FS root, and nothing above it", %{root: root} do
      assert :none = ProjectEnvConfig.locate(Path.join(root, "q"), @entries, root)
      # a marker above the FS root is not looked at
      assert :none = ProjectEnvConfig.locate(Path.join(root, "p/sub"), @entries, Path.join(root, "p/sub"))
    end

    test "the FS root itself counts", %{root: root} do
      File.write!(Path.join(root, "flake.nix"), "")
      assert {:ok, ^root, %{marker: "flake.nix"}} = ProjectEnvConfig.locate(Path.join(root, "q"), @entries, root)
    end
  end

  describe "decode/3" do
    @base %{"PATH" => "/usr/bin:/bin", "HOME" => "/home/me", "XDG_DATA_DIRS" => "/usr/share"}

    test "env: values as they are, null unsets" do
      {:ok, c} = ProjectEnvConfig.decode("env", ~s({"PATH":"/p/bin:/usr/bin:/bin","FOO":"1","OLD":null}), @base)
      assert c.set == %{"PATH" => "/p/bin:/usr/bin:/bin", "FOO" => "1"}
      assert c.unset == ["OLD"]
      assert c.path == "/p/bin:/usr/bin:/bin"
    end

    test "env: no PATH keeps the relay's; values that are not strings are refused" do
      {:ok, c} = ProjectEnvConfig.decode("env", ~s({"FOO":"1"}), @base)
      assert c.path == "/usr/bin:/bin"
      assert {:error, "the value of N is neither a string nor null"} = ProjectEnvConfig.decode("env", ~s({"N":1}), @base)
      assert {:error, "the output is not JSON"} = ProjectEnvConfig.decode("env", "", @base)
      assert {:error, "the output is not a JSON object"} = ProjectEnvConfig.decode("env", "[]", @base)
    end

    test "nix: exported only, nix develop's ignored ones left out, PATH and XDG_DATA_DIRS before the relay's" do
      out =
        :json.encode(%{
          "variables" => %{
            "PATH" => %{"type" => "exported", "value" => "/nix/a/bin"},
            "XDG_DATA_DIRS" => %{"type" => "exported", "value" => "/nix/a/share"},
            "HOME" => %{"type" => "exported", "value" => "/homeless-shelter"},
            "TMPDIR" => %{"type" => "exported", "value" => "/build"},
            "ERL_LIBS" => %{"type" => "exported", "value" => "/nix/cowboy"},
            "shellHook" => %{"type" => "exported", "value" => "echo hi"},
            "localvar" => %{"type" => "var", "value" => "x"},
            "arr" => %{"type" => "array", "value" => ["a"]}
          },
          "bashFunctions" => %{}
        })
        |> IO.iodata_to_binary()

      {:ok, c} = ProjectEnvConfig.decode("nix", out, @base)
      assert c.set["PATH"] == "/nix/a/bin:/usr/bin:/bin"
      assert c.set["XDG_DATA_DIRS"] == "/nix/a/share:/usr/share"
      assert c.set["ERL_LIBS"] == "/nix/cowboy"
      refute Map.has_key?(c.set, "HOME")
      refute Map.has_key?(c.set, "TMPDIR")
      refute Map.has_key?(c.set, "localvar")
      refute Map.has_key?(c.set, "arr")
      assert c.path == "/nix/a/bin:/usr/bin:/bin"
      assert {:error, _} = ProjectEnvConfig.decode("nix", ~s({"FOO":"1"}), @base)
    end
  end

  test "path_added: what is before the relay's own PATH" do
    assert ProjectEnvConfig.path_added("/p:/q:/usr/bin:/bin", "/usr/bin:/bin") == ["/p", "/q"]
    assert ProjectEnvConfig.path_added("/usr/bin:/bin", "/usr/bin:/bin") == []
    # a PATH of its own (not ending in the relay's): all of it
    assert ProjectEnvConfig.path_added("/p:/bin", "/usr/bin:/bin") == ["/p", "/bin"]
  end

  test "exec_env: set as {name, value}, unset as {name, false}" do
    env = ProjectEnvConfig.exec_env(%{set: %{"A" => "1"}, unset: ["B"], path: ""})
    assert {~c"A", ~c"1"} in env
    assert {~c"B", false} in env
  end

  test "find_executable on a given PATH" do
    dir = tmp!()
    exe = Path.join(dir, "tool")
    File.write!(exe, "#!/bin/sh\n")
    File.chmod!(exe, 0o755)
    File.write!(Path.join(dir, "plain"), "")
    assert ProjectEnvConfig.find_executable("tool", "/nonexistent:" <> dir) == exe
    assert ProjectEnvConfig.find_executable("plain", dir) == nil
    assert ProjectEnvConfig.find_executable("tool", "/usr/bin") == nil
    assert ProjectEnvConfig.find_executable(exe, "") == exe
  end

  defp tmp! do
    dir = Path.join(System.tmp_dir!(), "tezcatl-penv-#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    dir
  end
end

defmodule ProjectEnvTest do
  use ExUnit.Case, async: false

  setup_all do
    {:ok, _} = ProjectEnv.start_link(nil)
    :ok
  end

  setup do
    ProjectEnv.forget(:all)
    root = Path.join(System.tmp_dir!(), "tezcatl-penv-#{System.unique_integer([:positive])}")
    File.mkdir_p!(root)
    %{root: root}
  end

  defp entry(script, format \\ "env"), do: %{marker: "m", command: ["sh", "-c", script], format: format}

  test "the command runs in the root once; waiters share the answer; it is kept", %{root: root} do
    count = Path.join(root, "count")
    e = entry(~s(echo x >> "#{count}"; sleep 0.3; printf '{"HERE":"%s"}' "$PWD"))

    assert :pending = ProjectEnv.request(root, e, 5_000)
    assert :pending = ProjectEnv.request(root, e, 5_000)
    key = {root, "m"}
    assert_receive {:project_env, ^key, %{ok: true} = r}, 5_000
    assert_receive {:project_env, ^key, ^r}, 1_000
    assert r.change.set == %{"HERE" => root}
    assert ProjectEnv.kept?(root, e)
    assert {:ok, ^r} = ProjectEnv.request(root, e, 5_000)
    assert File.read!(count) == "x\n"
  end

  test "a failure is kept with the last line of stderr, until forgotten", %{root: root} do
    e = entry("echo first >&2; echo 'it broke' >&2; exit 3")
    r = ProjectEnv.await(root, e, 5_000)
    refute r.ok
    assert r.reason =~ "it broke"
    assert ProjectEnv.kept?(root, e)
    assert ProjectEnv.forget([root]) == [root]
    refute ProjectEnv.kept?(root, e)
  end

  test "no answer in time is a failure, and the command is stopped", %{root: root} do
    e = entry("sleep 30")
    r = ProjectEnv.await(root, e, 300)
    refute r.ok
    assert r.reason =~ "no answer in 0 s"
  end

  test "a command not on the PATH", %{root: root} do
    r = ProjectEnv.await(root, %{marker: "m", command: ["tezcatl-no-such-env-xyz"], format: "env"}, 1_000)
    refute r.ok
    assert r.reason =~ "not on the relay's PATH"
  end

  test "describe and exec_of", %{root: root} do
    r = ProjectEnv.await(root, entry(~s(printf '{"PATH":"/p:%s","A":"1","B":null}' "$PATH")), 5_000)
    d = ProjectEnv.describe(r)
    assert d["ok"] and d["pathAdded"] == ["/p"] and d["set"] == ["A"] and d["unset"] == ["B"]
    {env, path} = ProjectEnv.exec_of(r)
    assert String.starts_with?(path, "/p:")
    assert {~c"B", false} in env
    assert ProjectEnv.exec_of(nil) == {[], System.get_env("PATH")}
  end
end
