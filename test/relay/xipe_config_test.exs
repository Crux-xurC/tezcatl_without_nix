

defmodule XipeConfigTest do
  use ExUnit.Case, async: true

  describe "normalize/1 -- spawn projects" do
    test "a well-formed spawn entry -> projects keyed by root" do
      {:ok, cfg} =
        XipeConfig.normalize(%{
          "." => %{
            "mode" => "spawn",
            "installDir" => "../xipe_totec",
            "command" => ["elixir", "main.exs", "serve"],
            "port" => 4200
          }
        })

      assert cfg.problems == []
      proj = cfg.projects["."]
      assert proj.root_key == "."
      assert proj.mode == :spawn
      assert proj.install_dir == "../xipe_totec"
      assert proj.command == ["elixir", "main.exs", "serve"]
      assert proj.port == 4200
    end

    test "missing installDir/command/port are each rejected" do
      base = %{"mode" => "spawn", "installDir" => "x", "command" => ["xipe"], "port" => 1}

      assert {:ok, %{problems: []}} = XipeConfig.normalize(%{"a" => base})
      assert {:ok, %{problems: [p1]}} = XipeConfig.normalize(%{"a" => Map.delete(base, "installDir")})
      assert p1 =~ "installDir"
      assert {:ok, %{problems: [p2]}} = XipeConfig.normalize(%{"a" => Map.put(base, "command", [])})
      assert p2 =~ "command"
      assert {:ok, %{problems: [p3]}} = XipeConfig.normalize(%{"a" => Map.put(base, "port", 0)})
      assert p3 =~ "port"
    end
  end

  describe "normalize/1 -- connect projects" do
    test "a well-formed connect entry" do
      {:ok, cfg} =
        XipeConfig.normalize(%{"." => %{"mode" => "connect", "host" => "127.0.0.1", "port" => 4200}})

      assert cfg.problems == []
      proj = cfg.projects["."]
      assert proj.mode == :connect
      assert proj.host == "127.0.0.1"
      assert proj.port == 4200
    end

    test "missing host is rejected" do
      assert {:ok, %{problems: [p]}} =
               XipeConfig.normalize(%{"a" => %{"mode" => "connect", "port" => 4200}})

      assert p =~ "host"
    end
  end

  describe "normalize/1 -- misc" do
    test "empty doc -> empty projects" do
      assert {:ok, %{projects: %{}, problems: []}} = XipeConfig.normalize(%{})
    end

    test "unknown mode is dropped with a problem" do
      assert {:ok, %{projects: %{}, problems: [p]}} =
               XipeConfig.normalize(%{"a" => %{"mode" => "teleport"}})

      assert p =~ "unknown mode"
    end

    test "a bad entry is dropped, others survive" do
      {:ok, cfg} =
        XipeConfig.normalize(%{
          "good" => %{"mode" => "connect", "host" => "127.0.0.1", "port" => 1},
          "bad" => %{"mode" => "connect", "port" => 1}
        })

      assert Map.keys(cfg.projects) == ["good"]
      assert length(cfg.problems) == 1
    end

    test "non-object doc -> fatal" do
      assert {:error, _} = XipeConfig.normalize("nope")
    end
  end

  describe "project_for/2" do
    setup do
      {:ok, cfg} =
        XipeConfig.normalize(%{"." => %{"mode" => "connect", "host" => "127.0.0.1", "port" => 4200}})

      %{cfg: cfg}
    end

    test "hit", %{cfg: cfg} do
      assert {:ok, %{root_key: "."}} = XipeConfig.project_for(cfg, ".")
    end

    test "miss", %{cfg: cfg} do
      assert :error = XipeConfig.project_for(cfg, "other")
    end
  end

  describe "resolve_command/1" do
    test "a real binary on PATH resolves to an absolute charlist argv" do
      {:ok, [exe | args]} = XipeConfig.resolve_command(%{command: ["sh", "-c", "true"]})
      assert is_list(exe)
      assert List.to_string(exe) |> String.ends_with?("/sh")
      assert args == [~c"-c", ~c"true"]
    end

    test "a missing binary -> error" do
      assert {:error, reason} = XipeConfig.resolve_command(%{command: ["tezcatl-no-such-xipe-xyz"]})
      assert reason =~ "not found on PATH"
    end
  end

  describe "spawn_args/2" do
    test "passes the port and this relay's /lsp and file root, never a target directory (xipe picks its project)" do
      assert XipeConfig.spawn_args(%{port: 4200}, %{port: "4100", fs_root: "/w"}) ==
               ["--port", "4200", "--lsp", "ws://127.0.0.1:4100/lsp", "--fs-root", "/w"]
    end
  end
end
