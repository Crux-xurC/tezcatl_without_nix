

# One owner per open document of a shared server (D-lsp-owner, 2026-10-15):
# two code_editor editing one URI made one text out of two on the server.
defmodule LspOwnersTest do
  use ExUnit.Case, async: true

  @u "file:///p/a.ex"
  # consumers: atoms stand for pids; e1, e2 are editors, x a scanner
  defp editor?(c), do: c in [:e1, :e2]

  defp open(st, c), do: LspOwners.open(st, @u, c, &editor?/1)
  defp close(st, c), do: LspOwners.close(st, @u, c, &editor?/1)

  test "the first opener owns the document; a second editor only holds it, and is told" do
    {a1, st} = open(LspOwners.new(), :e1)
    assert a1 == [{:forward, @u}]
    {a2, st} = open(st, :e2)
    assert a2 == [{:held, :e2, @u}]
    assert LspOwners.owner(st, @u) == :e1
    assert LspOwners.may_change?(st, @u, :e1)
    refute LspOwners.may_change?(st, @u, :e2)
    # opening it again changes nothing
    assert {[], ^st} = open(st, :e1)
    assert LspOwners.docs(st) == 1
  end

  test "an editor takes a document over from a scanner: didClose, then its didOpen" do
    {_, st} = open(LspOwners.new(), :x)
    {a, st} = open(st, :e1)
    assert a == [{:server_close, @u}, {:forward, @u}]
    assert LspOwners.owner(st, @u) == :e1
    # the scanner's close is not sent on; the editor still owns it
    assert {[], st} = close(st, :x)
    assert LspOwners.owner(st, @u) == :e1
  end

  test "a scanner opening an editor's document only holds it, and is not told" do
    {_, st} = open(LspOwners.new(), :e1)
    assert {[], st} = open(st, :x)
    assert LspOwners.owner(st, @u) == :e1
  end

  test "the owner closes: didClose, and the first editor still holding it is told to open it again" do
    {_, st} = open(LspOwners.new(), :e1)
    {_, st} = open(st, :x)
    {_, st} = open(st, :e2)
    {a, st} = close(st, :e1)
    assert a == [{:server_close, @u}, {:released, :e2, @u}]
    assert LspOwners.owner(st, @u) == nil
    # e2 opens it again (its didOpen with its own text) and owns it
    assert {[{:forward, @u}], st} = open(st, :e2)
    assert LspOwners.owner(st, @u) == :e2
  end

  test "the last holder going leaves nothing open; a non-owner's close says nothing" do
    {_, st} = open(LspOwners.new(), :e1)
    {_, st} = open(st, :e2)
    assert {[], st} = close(st, :e2)
    assert {[{:server_close, @u}], st} = close(st, :e1)
    assert LspOwners.docs(st) == 0
    assert {[], _} = close(st, :e1)
  end

  test "a consumer that goes closes all it holds" do
    v = "file:///p/b.ex"
    {_, st} = open(LspOwners.new(), :e1)
    {_, st} = LspOwners.open(st, v, :e1, &editor?/1)
    {_, st} = LspOwners.open(st, v, :e2, &editor?/1)
    {a, st} = LspOwners.leave(st, :e1, &editor?/1)
    assert a == [{:server_close, @u}, {:server_close, v}, {:released, :e2, v}]
    assert LspOwners.docs(st) == 1
  end
end
