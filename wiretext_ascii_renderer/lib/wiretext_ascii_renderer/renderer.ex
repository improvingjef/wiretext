defmodule WiretextAsciiRenderer.Renderer do
  @moduledoc """
  ASCII renderer for a layout-focused WireText AST.

  Single mode:
  - frame only ratio-based sections
  - section names are structural and never rendered as content
  - preserve table pipes, replace non-table pipes with whitespace
  """

  @min_width 18
  @known_input_types ~w(text password date time phone email number url search tel color file range)

  @type wt_node :: map()

  @spec render(wt_node(), keyword()) :: String.t()
  def render(ast, opts \\ []) do
    width = Keyword.get(opts, :width, 140)
    ctx = %{frame_depth: 0}

    ast
    |> render_node(width, ctx)
    |> Enum.join("\n")
  end

  defp render_node(%{type: :root, children: children}, width, ctx) do
    children
    |> Enum.flat_map(&render_node(&1, width, ctx))
    |> trim_blank_edges()
  end

  defp render_node(%{type: :group, children: children}, width, ctx) do
    horizontal_blocks(children, width, ctx)
  end

  defp render_node(%{type: :section, ratio: ratio, children: children}, width, ctx) do
    frame? = match?({_, _}, ratio)

    inner_width = if frame?, do: max(width - 2, @min_width), else: max(width, @min_width)
    child_ctx = if frame?, do: %{ctx | frame_depth: ctx.frame_depth + 1}, else: ctx

    inner_lines =
      children
      |> render_vertical(inner_width, child_ctx)
      |> ensure_non_empty(["(empty)"])

    if frame? do
      frame(inner_lines, width)
    else
      # Non-ratio sections are structural tags/ids and are not visible content.
      inner_lines
    end
  end

  defp render_node(%{type: :row, text: text}, width, _ctx) do
    text
    |> normalize_row_text()
    |> wrap_line(max(width, @min_width))
  end

  defp render_vertical(children, width, ctx) do
    children
    |> Enum.with_index()
    |> Enum.flat_map(fn {child, idx} ->
      block = render_node(child, width, ctx)
      if idx == 0, do: block, else: [""] ++ block
    end)
    |> trim_blank_edges()
  end

  defp horizontal_blocks(children, width, ctx) do
    case children do
      [] ->
        [""]

      [_one] ->
        render_vertical(children, width, ctx)

      _many ->
        widths = child_widths(children, width)

        blocks =
          Enum.zip(children, widths)
          |> Enum.map(fn {child, child_width} ->
            child
            |> render_node(child_width, ctx)
            |> ensure_non_empty([""])
          end)

        join_columns(blocks, "   ")
    end
  end

  defp child_widths(children, total_width) do
    ratios =
      Enum.map(children, fn
        %{type: :section, ratio: {n, d}} when d > 0 -> n / d
        _ -> nil
      end)

    ratio_sum = ratios |> Enum.reject(&is_nil/1) |> Enum.sum()
    flexible = Enum.count(ratios, &is_nil/1)

    base =
      Enum.map(ratios, fn
        nil ->
          if flexible > 0 do
            trunc(total_width / max(length(children), 1))
          else
            @min_width
          end

        value when ratio_sum > 0 ->
          trunc(total_width * (value / ratio_sum))

        _ ->
          trunc(total_width / max(length(children), 1))
      end)

    base = Enum.map(base, &max(&1, @min_width))

    spread_to_total(base, total_width)
  end

  defp spread_to_total(widths, total_width) do
    current = Enum.sum(widths) + max(length(widths) - 1, 0)

    cond do
      current == total_width -> widths
      current < total_width -> grow(widths, total_width - current)
      true -> shrink(widths, current - total_width)
    end
  end

  defp grow(widths, 0), do: widths

  defp grow(widths, extra) do
    idx = rem(extra - 1, length(widths))
    widths = List.update_at(widths, idx, &(&1 + 1))
    grow(widths, extra - 1)
  end

  defp shrink(widths, 0), do: widths

  defp shrink(widths, deficit) do
    idx = rem(deficit - 1, length(widths))

    widths =
      List.update_at(widths, idx, fn w ->
        if w > @min_width, do: w - 1, else: w
      end)

    shrink(widths, deficit - 1)
  end

  defp join_columns(blocks, separator) do
    heights = Enum.map(blocks, &length/1)
    max_height = Enum.max(heights)

    padded =
      Enum.map(blocks, fn lines ->
        width = max_line_width(lines)
        pad_to_height(lines, max_height, width)
      end)

    0..(max_height - 1)
    |> Enum.map(fn row_idx ->
      padded
      |> Enum.map(&Enum.at(&1, row_idx, ""))
      |> Enum.join(separator)
      |> String.trim_trailing()
    end)
  end

  defp frame(inner_lines, width) do
    safe_width = max(width, @min_width)
    content_width = safe_width - 2
    border = "+" <> String.duplicate("-", content_width) <> "+"

    body =
      inner_lines
      |> Enum.flat_map(&prepare_frame_line(&1, content_width))
      |> Enum.map(fn line -> "|" <> String.pad_trailing(line, content_width) <> "|" end)

    [border] ++ body ++ [border]
  end

  defp prepare_frame_line(line, content_width) do
    line = to_string(line)

    cond do
      String.starts_with?(line, "+") or String.starts_with?(line, "|") ->
        [String.slice(line, 0, content_width)]

      true ->
        wrap_line(line, content_width)
    end
  end

  defp wrap_line(text, width) do
    text = to_string(text)

    cond do
      width <= 1 -> [String.slice(text, 0, 1)]
      text == "" -> [""]
      true -> wrap_words(String.split(text, ~r/\s+/, trim: true), width, "", [])
    end
  end

  defp wrap_words([], _width, "", acc), do: Enum.reverse(acc)
  defp wrap_words([], _width, current, acc), do: Enum.reverse([current | acc])

  defp wrap_words([word | rest], width, "", acc) do
    if String.length(word) <= width do
      wrap_words(rest, width, word, acc)
    else
      {take, remain} = String.split_at(word, width)
      wrap_words([remain | rest], width, "", [take | acc])
    end
  end

  defp wrap_words([word | rest], width, current, acc) do
    candidate = current <> " " <> word

    if String.length(candidate) <= width do
      wrap_words(rest, width, candidate, acc)
    else
      wrap_words([word | rest], width, "", [current | acc])
    end
  end

  defp normalize_row_text(text) do
    text = String.trim(text)
    table_row? = String.starts_with?(text, "|") and String.ends_with?(text, "|")

    base =
      text
      |> String.replace(~r/^#+\s+/, "")
      |> String.replace(~r/^[-*]\s+/, "- ")
      |> String.replace(~r/^\d+\.\s+/, "")
      |> String.replace(~r/`\(([^)]*)\)`/, "(\\1)")
      |> String.replace(~r/^\^\^\s+"([^"]+)"$/, "[textarea: \\1]")
      |> String.replace(~r/^\^\^$/, "[textarea]")
      |> then(fn s ->
        Regex.replace(~r/\^([a-zA-Z0-9_]+)/, s, fn _all, field ->
        if field in @known_input_types do
          "[#{field}]"
        else
          "#{String.replace(field, "_", " ")}: [text]"
        end
      end)
      end)
      |> String.replace(~r/!!"([^"]+)"/, "[! \\1]")
      |> String.replace(~r/!"([^"]+)"/, "[\\1]")
      |> String.replace(~r/!!([^\s|]+)/, "[! \\1]")
      |> String.replace(~r/!([^\s|]+)/, "[\\1]")
      |> String.replace(~r/i:([a-zA-Z0-9_\-]+)/, "<\\1>")
      |> String.replace(~r/_([^_]+)_/, "\\1")

    base =
      if table_row? do
        String.replace(base, ~r/\s+\|\s+/, " | ")
      else
        String.replace(base, "|", " ")
      end

    base
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  defp trim_blank_edges(lines) do
    lines
    |> drop_while_blank()
    |> Enum.reverse()
    |> drop_while_blank()
    |> Enum.reverse()
  end

  defp drop_while_blank(lines) do
    Enum.drop_while(lines, fn line -> String.trim(line) == "" end)
  end

  defp ensure_non_empty([], fallback), do: fallback
  defp ensure_non_empty(lines, _fallback), do: lines

  defp max_line_width(lines) do
    lines
    |> Enum.map(&String.length/1)
    |> Enum.max(fn -> 0 end)
  end

  defp pad_to_height(lines, height, width) do
    padded = Enum.map(lines, &String.pad_trailing(&1, width))
    padded ++ List.duplicate(String.duplicate(" ", width), max(height - length(lines), 0))
  end
end
