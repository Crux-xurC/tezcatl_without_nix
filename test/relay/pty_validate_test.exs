

defmodule PtyValidateTest do
  use ExUnit.Case, async: true

  describe "validate_cmd/1" do
    test "a non-empty list of strings with a resolvable cmd[0] -> {:ok, charlist argv}" do
      assert {:ok, [exe]} = PtyValidate.validate_cmd(["sh"])
      assert is_list(exe)
      assert to_string(exe) == System.find_executable("sh")
    end

    test "args are kept, in order, as charlists after cmd[0]" do
      {:ok, argv} = PtyValidate.validate_cmd(["sh", "-c", "echo hi"])
      assert [_exe, ~c"-c", ~c"echo hi"] = argv
    end

    test "cmd[0] not on PATH -> {:error, not found}" do
      miss = "tezcatl-no-such-binary-#{System.unique_integer([:positive])}"
      assert {:error, msg} = PtyValidate.validate_cmd([miss])
      assert msg =~ "not found on PATH"
    end

    test "a list with a non-string element -> {:error, must all be strings}" do
      assert PtyValidate.validate_cmd(["sh", 123]) ==
               {:error, "cmd elements must all be strings"}
    end

    test "empty list -> {:error, non-empty array}" do
      assert PtyValidate.validate_cmd([]) ==
               {:error, "cmd must be a non-empty array of strings"}
    end

    test "not a list at all -> {:error, non-empty array}" do
      for bad <- ["sh", nil, %{"cmd" => "sh"}, 42] do
        assert PtyValidate.validate_cmd(bad) ==
                 {:error, "cmd must be a non-empty array of strings"}
      end
    end
  end

  describe "validate_size/2" do
    test "two integers in range -> {:ok, rows, cols}" do
      assert PtyValidate.validate_size(24, 80) == {:ok, 24, 80}
    end

    test "the range boundaries (1 and max_dim) are accepted" do
      max = PtyValidate.max_dim()
      assert PtyValidate.validate_size(1, 1) == {:ok, 1, 1}
      assert PtyValidate.validate_size(max, max) == {:ok, max, max}
    end

    test "zero / negative / over-max are rejected" do
      for {r, c} <- [{0, 80}, {24, 0}, {-1, 80}, {24, -1}, {65_536, 80}, {24, 65_536}] do
        assert {:error, msg} = PtyValidate.validate_size(r, c)
        assert msg =~ "rows/cols must be integers"
      end
    end

    test "non-integers (string, nil, float) are rejected" do
      for {r, c} <- [{"24", 80}, {24, "80"}, {nil, nil}, {24.0, 80}, {24, 80.0}] do
        assert {:error, _} = PtyValidate.validate_size(r, c)
      end
    end
  end

  describe "validate_cwd/1" do
    test "nil -> {:ok, []} (no :cd option)" do
      assert PtyValidate.validate_cwd(nil) == {:ok, []}
    end

    test "a string naming a real directory -> {:ok, [{:cd, charlist}]}" do
      dir = System.tmp_dir!()
      assert {:ok, [{:cd, cd}]} = PtyValidate.validate_cwd(dir)
      assert to_string(cd) == dir
    end

    test "a string that is not an existing directory -> {:error, ...}" do
      gone = "/tezcatl/no/such/dir-#{System.unique_integer([:positive])}"
      assert {:error, msg} = PtyValidate.validate_cwd(gone)
      assert msg =~ "not an existing directory"
    end

    test "a non-string -> {:error, must be a string}" do
      assert PtyValidate.validate_cwd(123) == {:error, "cwd must be a string"}
      assert PtyValidate.validate_cwd(["/tmp"]) == {:error, "cwd must be a string"}
    end
  end
end
