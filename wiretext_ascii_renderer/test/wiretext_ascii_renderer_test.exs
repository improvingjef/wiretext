defmodule WiretextAsciiRendererTest do
  use ExUnit.Case

  test "renders sample wiretext file with structural frames and no section labels" do
    file = "/Users/jef/misc/codex-chat-layout-v2.wiretext"

    assert {:ok, output} = WiretextAsciiRenderer.render_file(file, width: 120)
    assert output =~ "+"
    refute output =~ "aside 1/6"
    refute output =~ "section 5/6"
    refute output =~ "threads 1/4"
    refute output =~ "chat 3/4"
    refute output =~ "THREADS_HEADER"
    refute output =~ "CHAT_HEADER"
    refute output =~ "THREADS_LIST"
  end
end
