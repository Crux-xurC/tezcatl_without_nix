

# $/cancelRequest: a consumer names its request by its own id; the server
# knows it by the relay's (LspServer gives every forwarded request a new id).
defmodule LspCancelTest do
  use ExUnit.Case, async: true

  test "the relay's id of a waiting request is found by consumer and its own id" do
    a = self()
    b = spawn(fn -> :ok end)
    pending = %{10 => {a, 1}, 11 => {b, 1}, 12 => {a, 2}}
    assert LspServer.cancel_gid(pending, a, 1) == 10
    assert LspServer.cancel_gid(pending, b, 1) == 11
    assert LspServer.cancel_gid(pending, a, 2) == 12
  end

  test "a request already answered, or another consumer's number, is not found" do
    a = self()
    b = spawn(fn -> :ok end)
    pending = %{10 => {a, 1}}
    assert LspServer.cancel_gid(pending, a, 7) == nil
    assert LspServer.cancel_gid(pending, b, 1) == nil
    # the relay's own number is not a consumer's
    assert LspServer.cancel_gid(pending, a, 10) == nil
    assert LspServer.cancel_gid(%{}, a, 1) == nil
  end
end
