

defmodule LspConfigTest do
  use ExUnit.Case, async: true

  describe "normalize/1" do
    test "a well-formed doc -> servers keyed by language id" do
      {:ok, cfg} =
        LspConfig.normalize(%{
          "autostart" => true,
          "servers" => %{
            "javascript" => %{
              "command" => ["typescript-language-server", "--stdio"],
              "rootMarkers" => ["tsconfig.json", ".git"]
            }
          }
        })

      assert cfg.autostart == true
      assert cfg.problems == []
      srv = cfg.servers["javascript"]
      assert srv.id == "javascript"
      assert srv.command == ["typescript-language-server", "--stdio"]
      assert srv.root_markers == ["tsconfig.json", ".git"]
    end

    test "autostart defaults to true, missing servers -> empty" do
      assert {:ok, %{autostart: true, servers: %{}}} = LspConfig.normalize(%{})
    end

    test "autostart false is honoured" do
      assert {:ok, %{autostart: false}} = LspConfig.normalize(%{"autostart" => false})
    end

    test "rootMarkers omitted -> defaults to [.git], no init_options" do
      {:ok, cfg} =
        LspConfig.normalize(%{"servers" => %{"rust" => %{"command" => ["rust-analyzer"]}}})

      assert cfg.servers["rust"].root_markers == [".git"]
      assert cfg.servers["rust"].init_options == nil
    end

    test "initializationOptions is carried through when it is an object" do
      {:ok, cfg} =
        LspConfig.normalize(%{
          "servers" => %{
            "javascript" => %{
              "command" => ["tsserver"],
              "initializationOptions" => %{"hostInfo" => "tezcatl", "tsserver" => %{"path" => "/x"}}
            }
          }
        })

      assert cfg.servers["javascript"].init_options == %{
               "hostInfo" => "tezcatl",
               "tsserver" => %{"path" => "/x"}
             }
    end

    test "a bad server entry is dropped, others survive, problem recorded" do
      {:ok, cfg} =
        LspConfig.normalize(%{
          "servers" => %{
            "javascript" => %{"command" => ["tsserver"]},
            "broken" => %{"command" => []},
            "alsobroken" => %{"command" => "not-an-array"}
          }
        })

      assert Map.keys(cfg.servers) == ["javascript"]
      assert length(cfg.problems) == 2
      assert Enum.any?(cfg.problems, &String.contains?(&1, "broken"))
    end

    test "non-object servers -> fatal" do
      assert {:error, _} = LspConfig.normalize(%{"servers" => []})
    end

    test "non-object doc -> fatal" do
      assert {:error, _} = LspConfig.normalize("nope")
    end
  end

  describe "server_for/2" do
    setup do
      {:ok, cfg} =
        LspConfig.normalize(%{"servers" => %{"javascript" => %{"command" => ["tsserver"]}}})

      %{cfg: cfg}
    end

    test "hit", %{cfg: cfg} do
      assert {:ok, %{id: "javascript"}} = LspConfig.server_for(cfg, "javascript")
    end

    test "miss", %{cfg: cfg} do
      assert :error = LspConfig.server_for(cfg, "python")
    end
  end

  describe "editor (a separate server for the editor)" do
    setup do
      {:ok, cfg} =
        LspConfig.normalize(%{
          "servers" => %{
            "elixir" => %{
              "command" => ["elixir-ls"],
              "rootMarkers" => ["mix.exs", ".git"],
              "editor" => %{"command" => ["tezcatl-elixir-lsp"]}
            },
            "javascript" => %{"command" => ["tsserver"]}
          }
        })

      %{cfg: cfg}
    end

    test "client editor gets the editor server (own id, the main entry's rootMarkers)", %{cfg: cfg} do
      assert {:ok, %{id: "elixir:editor", command: ["tezcatl-elixir-lsp"], root_markers: ["mix.exs", ".git"]}} =
               LspConfig.server_for(cfg, "elixir", "editor")
    end

    test "any other client (xipe_totec's scanner) keeps the main one", %{cfg: cfg} do
      assert {:ok, %{id: "elixir", command: ["elixir-ls"]}} = LspConfig.server_for(cfg, "elixir")
      assert {:ok, %{id: "elixir"}} = LspConfig.server_for(cfg, "elixir", "xipe")
    end

    test "no editor entry -> the editor gets the main server too", %{cfg: cfg} do
      assert {:ok, %{id: "javascript"}} = LspConfig.server_for(cfg, "javascript", "editor")
    end

    test "a bad editor entry drops the whole server, with the problem recorded" do
      {:ok, cfg} =
        LspConfig.normalize(%{"servers" => %{"elixir" => %{"command" => ["elixir-ls"], "editor" => %{"command" => []}}}})

      assert cfg.servers == %{}
      assert [problem] = cfg.problems
      assert problem =~ "editor"
    end
  end

  describe "resolve_command/1" do
    test "a real binary on PATH resolves to an absolute charlist argv" do
      {:ok, [exe | args]} = LspConfig.resolve_command(%{command: ["sh", "-c", "true"]})
      assert is_list(exe)
      assert List.to_string(exe) |> String.ends_with?("/sh")
      assert args == [~c"-c", ~c"true"]
    end

    test "a missing binary -> error" do
      assert {:error, reason} =
               LspConfig.resolve_command(%{command: ["tezcatl-no-such-lsp-xyz"]})

      assert reason =~ "not found on PATH"
    end
  end

  describe "find_root/3" do
    setup do
      base = Path.join(System.tmp_dir!(), "lsp_root_#{System.unique_integer([:positive])}")
      on_exit(fn -> File.rm_rf(base) end)
      File.mkdir_p!(Path.join(base, "proj/src/deep"))
      File.write!(Path.join(base, "proj/package.json"), "{}")
      %{base: base}
    end

    test "walks up to the dir holding a marker", %{base: base} do
      root = LspConfig.find_root(Path.join(base, "proj/src/deep/a.ts"), ["package.json"], base)
      assert root == Path.join(base, "proj")
    end

    test "no marker anywhere -> falls back to fs_root", %{base: base} do
      root = LspConfig.find_root(Path.join(base, "proj/src/a.ts"), ["Cargo.toml"], base)
      assert root == Path.expand(base)
    end

    test "never climbs above fs_root", %{base: base} do
      # marker only exists above fs_root would still not be reachable; here the
      # search dir is fs_root itself with no marker -> fs_root.
      root = LspConfig.find_root(Path.join(base, "x.ts"), ["package.json"], base)
      assert root == Path.expand(base)
    end

    test "the file's own directory can be the root", %{base: base} do
      File.write!(Path.join(base, "proj/src/deep/.git"), "")
      root = LspConfig.find_root(Path.join(base, "proj/src/deep/a.ts"), [".git"], base)
      assert root == Path.join(base, "proj/src/deep")
    end
  end
end
