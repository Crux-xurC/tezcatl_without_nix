

defmodule FsValidateTest do
  use ExUnit.Case, async: true

  @root "/srv/project"

  describe "resolve/2 -- accepts" do
    test "missing path -> the root itself" do
      assert FsValidate.resolve(@root, nil) == {:ok, @root}
      assert FsValidate.resolve(@root, "") == {:ok, @root}
    end

    test "a normal subpath -> normalised absolute under the root" do
      assert FsValidate.resolve(@root, "lib/config.js") == {:ok, "/srv/project/lib/config.js"}
      assert FsValidate.resolve(@root, "lib") == {:ok, "/srv/project/lib"}
    end

    test "interior . and .. that stay under the root are collapsed" do
      assert FsValidate.resolve(@root, "lib/./relay/../config.js") ==
               {:ok, "/srv/project/lib/config.js"}
      assert FsValidate.resolve(@root, "a/b/../../lib") == {:ok, "/srv/project/lib"}
    end

    test "a trailing-slash root is handled (no doubled separator, no false escape)" do
      assert FsValidate.resolve("/srv/project/", "lib") == {:ok, "/srv/project/lib"}
    end
  end

  describe "resolve/2 -- rejects" do
    test ".. that climbs out of the root" do
      assert FsValidate.resolve(@root, "../etc/passwd") == {:error, "path escapes the root"}
      assert FsValidate.resolve(@root, "lib/../../secret") == {:error, "path escapes the root"}
    end

    test "an absolute path (would ignore the root)" do
      assert FsValidate.resolve(@root, "/etc/passwd") ==
               {:error, "path must be relative to the root"}
    end

    test "a sibling directory sharing a name prefix is not 'under' the root" do
      assert FsValidate.resolve(@root, "../project-secret/x") ==
               {:error, "path escapes the root"}
    end

    test "a NUL byte" do
      assert FsValidate.resolve(@root, "lib/\0/x") == {:error, "path contains a NUL byte"}
    end

    test "a non-string path" do
      assert FsValidate.resolve(@root, 123) == {:error, "path must be a string"}
      assert FsValidate.resolve(@root, %{}) == {:error, "path must be a string"}
    end
  end

  describe "locate/3 -- the two roots" do
    @work "/state/tezcatl/work"

    test "a path that starts with ~work is under the work place" do
      assert FsValidate.locate(@root, @work, "~work") == {:ok, @work, :work}
      assert FsValidate.locate(@root, @work, "~work/clone/lib/a.ex") == {:ok, "/state/tezcatl/work/clone/lib/a.ex", :work}
    end

    test "anything else is under the FS root (a name that only begins with ~work too)" do
      assert FsValidate.locate(@root, @work, "lib/a.ex") == {:ok, "/srv/project/lib/a.ex", :root}
      assert FsValidate.locate(@root, @work, "") == {:ok, @root, :root}
      assert FsValidate.locate(@root, @work, "~workbench/a") == {:ok, "/srv/project/~workbench/a", :root}
    end

    test "neither root is left" do
      assert {:error, _} = FsValidate.locate(@root, @work, "~work/../mirror/index.json")
      assert {:error, _} = FsValidate.locate(@root, @work, "../x")
      assert {:error, _} = FsValidate.locate(@root, @work, "~work//etc/passwd")
    end
  end
end
