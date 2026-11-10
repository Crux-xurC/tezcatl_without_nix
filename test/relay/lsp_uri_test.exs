

# LspServer.file_uri/1: the URI the relay gives the
# editor and the server. xipe_totec's Scanner.Lsp.file_uri/1 must agree.
defmodule LspUriTest do
  use ExUnit.Case, async: true

  test "a plain path is left as it is" do
    assert LspServer.file_uri("/home/u/proj/lib/a.ex") == "file:///home/u/proj/lib/a.ex"
    assert LspServer.file_uri("/a/b-c_d.e~f") == "file:///a/b-c_d.e~f"
  end

  test "a space, non-ASCII and the characters that end or escape a URI path are encoded" do
    assert LspServer.file_uri("/a b/x.js") == "file:///a%20b/x.js"
    assert LspServer.file_uri("/日本/x.js") == "file:///%E6%97%A5%E6%9C%AC/x.js"
    # a raw # would start a fragment, a raw % an escape (p%41 would be pA)
    assert LspServer.file_uri("/p#1/p%41.js") == "file:///p%231/p%2541.js"
    assert LspServer.file_uri("/x?y/(z)") == "file:///x%3Fy/%28z%29"
  end

  test "it decodes back to the path" do
    for p <- ["/a b/x.js", "/日本/x.js", "/p#1/p%41.js", "/x?y/(z)+!"] do
      "file://" <> enc = LspServer.file_uri(p)
      assert URI.decode(enc) == p
    end
  end
end
