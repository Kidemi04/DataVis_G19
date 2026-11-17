(() => {
  "use strict";

  const status = document.getElementById("q5-status");
  const visualisations = document.getElementById("q5-visualisations");
  const d3 = window.d3;
  if (!d3) {
    status.textContent = "Q5 needs the D3 library. Check your connection and reload the page.";
    return;
  }

  const areas = ["Major Cities", "Regional", "Remote"];
  const years = d3.range(2011, 2022);
  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const gapColour = ["#214a76", "#f6f2e8", "#91431b"];
  const formatGap = d3.format("+.1f");
  const formatNumber = d3.format(",d");
  const formatDecimal = d3.format(".1f");

  function parseRow(row) {
    const number = (key) => {
      const value = row[key]?.trim();
      return value ? Number(value) : NaN;
    };

    return {
      year: number("Calendar year"),
      area: row["ABS remoteness area"]?.trim(),
      firstCount: number("First Nations people+Mean(Sum(Hospitalisations))"),
      firstTotal: number("First Nations people+Mean(Sum(Sum(Hospitalisations)))"),
      firstShare: number("First Nations people+Mean(share_pct)"),
      nonCount: number("Non-Indigenous+Mean(Sum(Hospitalisations))"),
      nonTotal: number("Non-Indigenous+Mean(Sum(Sum(Hospitalisations)))"),
      nonShare: number("Non-Indigenous+Mean(share_pct)"),
      gap: number("gap_pp"),
    };
  }

  function validateRows(rows) {
    const byAreaAndYear = d3.index(rows, (row) => row.area, (row) => row.year);
    const close = (actual, expected) => Math.abs(actual - expected) < 0.01;
    const validCount = (count, total) => Number.isInteger(count) &&
      Number.isInteger(total) && total > 0 && count >= 0 && count <= total;

    if (rows.length !== areas.length * years.length) {
      throw new Error("Q5 data must contain one row per year and residence area.");
    }

    for (const area of areas) {
      for (const year of years) {
        const row = byAreaAndYear.get(area)?.get(year);
        if (!row ||
            !validCount(row.firstCount, row.firstTotal) ||
            !validCount(row.nonCount, row.nonTotal) ||
            !close(row.firstShare, row.firstCount / row.firstTotal * 100) ||
            !close(row.nonShare, row.nonCount / row.nonTotal * 100) ||
            !close(row.gap, row.firstShare - row.nonShare)) {
          throw new Error("Invalid Q5 data for " + area + " in " + year + ".");
        }
      }
    }

    return byAreaAndYear;
  }

  function readableText(background) {
    const colour = d3.rgb(background);
    const linear = (channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b);
    return luminance > 0.179 ? "#000" : "#fff";
  }

  function renderQ5(rows, byAreaAndYear) {
    const heatmap = d3.select("#q5-heatmap");
    const trend = d3.select("#q5-trend");
    const areaControl = d3.select("#q5-area");
    const limit = Math.ceil(d3.max(rows, (row) => Math.abs(row.gap)) / 10) * 10 || 10;
    const colour = d3.scaleLinear()
      .domain([-limit, 0, limit])
      .range(gapColour)
      .interpolate(d3.interpolateLab)
      .clamp(true);

    let selected = byAreaAndYear.get(areas[0]).get(lastYear);
    let keyboardCell = selected;
    let compact = null;
    let chartWidth = 0;
    let cells;

    d3.select(".q5-colour-scale")
      .style("background", "linear-gradient(to right, " + gapColour.join(", ") + ")");
    d3.select("#q5-scale-low").text("−" + limit + " pp");
    d3.select("#q5-scale-high").text("+" + limit + " pp");
    areaControl.selectAll("option")
      .data(areas)
      .join("option")
      .attr("value", (area) => area)
      .text((area) => area);
    areaControl.on("change", function () {
      selectCell(byAreaAndYear.get(this.value).get(selected.year));
    });

    function shareDetail(count, total, share) {
      return formatDecimal(share) + "% (" + formatNumber(count) + " of " + formatNumber(total) + ")";
    }

    function showDetails(row) {
      d3.select("#q5-details-title").text(row.area + " · " + row.year);
      d3.select("#q5-first-nations").text(shareDetail(row.firstCount, row.firstTotal, row.firstShare));
      d3.select("#q5-non-indigenous").text(shareDetail(row.nonCount, row.nonTotal, row.nonShare));
      d3.select("#q5-gap").text(formatGap(row.gap) + " pp");
    }

    function updateCells() {
      cells
        .attr("tabindex", (row) => row === keyboardCell ? 0 : -1)
        .attr("aria-pressed", (row) => String(row === selected));
    }

    function handleArrow(event, row) {
      const step = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
      }[event.key];
      if (!step) return;
      event.preventDefault();

      const areaIndex = areas.indexOf(row.area) + step[compact ? 1 : 0];
      const yearIndex = years.indexOf(row.year) + step[compact ? 0 : 1];
      const next = byAreaAndYear.get(areas[areaIndex])?.get(years[yearIndex]);
      if (next) {
        cells.filter((cell) => cell === next).node().focus();
      }
    }

    function drawHeatmap() {
      const table = heatmap.selectAll("table").data([null]).join("table").attr("class", "q5-heatmap");
      table.selectAll("*").remove();
      table.append("caption")
        .attr("class", "q5-visually-hidden")
        .text("Share gap between First Nations and non-Indigenous hospitalisations, in percentage points");

      const columns = compact ? ["Year", ...areas] : ["Area", ...years];
      table.append("thead").append("tr").selectAll("th")
        .data(columns)
        .join("th")
        .attr("scope", "col")
        .text((column) => column);

      const heatmapRows = compact
        ? years.map((year) => [year, areas.map((area) => byAreaAndYear.get(area).get(year))])
        : areas.map((area) => [area, years.map((year) => byAreaAndYear.get(area).get(year))]);
      const tableRows = table.append("tbody").selectAll("tr").data(heatmapRows).join("tr");
      tableRows.append("th").attr("scope", "row").text(([label]) => label);

      cells = tableRows.selectAll("td")
        .data(([, values]) => values)
        .join("td")
        .append("button")
        .attr("type", "button")
        .attr("class", "q5-cell")
        .attr("aria-label", (row) => row.area + ", " + row.year +
          ". First Nations " + formatDecimal(row.firstShare) + " percent, non-Indigenous " +
          formatDecimal(row.nonShare) + " percent. Gap " + formatGap(row.gap) + " percentage points.")
        .style("background-color", (row) => colour(row.gap))
        .style("color", (row) => readableText(colour(row.gap)))
        .text((row) => formatGap(row.gap))
        .on("pointerenter", (event, row) => showDetails(row))
        .on("focus", (event, row) => {
          keyboardCell = row;
          updateCells();
          showDetails(row);
        })
        .on("keydown", handleArrow)
        .on("click", (event, row) => selectCell(row));

      updateCells();
    }

    function drawTrend() {
      const series = years.map((year) => byAreaAndYear.get(selected.area).get(year));
      const margin = { top: 18, right: 17, bottom: 34, left: 36 };
      const height = chartWidth < 450 ? 196 : 245;
      const plotWidth = chartWidth - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;
      const x = d3.scaleLinear().domain([firstYear, lastYear]).range([0, plotWidth]);
      const y = d3.scaleLinear().domain([-limit, limit]).range([plotHeight, 0]);
      const ticks = chartWidth < 380
        ? [2011, 2014, 2017, 2021]
        : chartWidth < 580 ? years.filter((year) => year % 2 === 1) : years;

      const chart = trend.selectAll("svg").data([null]).join("svg")
        .attr("viewBox", "0 0 " + chartWidth + " " + height)
        .attr("role", "img")
        .attr("aria-label", "Annual share gap for " + selected.area + " in percentage points. " +
          firstYear + ": " + formatGap(series[0].gap) + ". " +
          lastYear + ": " + formatGap(series[series.length - 1].gap) + ".");
      chart.selectAll("*").remove();
      const plot = chart.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      plot.append("g")
        .attr("class", "q5-grid")
        .call(d3.axisLeft(y).tickValues([-limit, -limit / 2, 0, limit / 2, limit])
          .tickSize(-plotWidth).tickPadding(8).tickFormat(d3.format("d")))
        .select(".domain").remove();
      plot.append("g")
        .attr("class", "q5-axis")
        .attr("transform", "translate(0," + plotHeight + ")")
        .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("d")).tickSizeOuter(0));
      plot.append("line").attr("class", "q5-zero-line")
        .attr("x2", plotWidth).attr("y1", y(0)).attr("y2", y(0));
      plot.append("line").attr("class", "q5-year-line")
        .attr("x1", x(selected.year)).attr("x2", x(selected.year))
        .attr("y2", plotHeight);
      plot.append("path")
        .datum(series)
        .attr("class", "q5-trend-line")
        .attr("d", d3.line().x((row) => x(row.year)).y((row) => y(row.gap)));
      plot.selectAll("circle")
        .data(series)
        .join("circle")
        .attr("class", (row) => row === selected ? "q5-point q5-point-selected" : "q5-point")
        .attr("cx", (row) => x(row.year))
        .attr("cy", (row) => y(row.gap))
        .attr("r", (row) => row === selected ? 5.5 : 3);
    }

    const endpoints = areas.map((area) => {
      const start = byAreaAndYear.get(area).get(firstYear).gap;
      const end = byAreaAndYear.get(area).get(lastYear).gap;
      return { area, start, end, change: Math.abs(end) - Math.abs(start) };
    });

    const endpointRows = d3.select("#q5-endpoint-rows").selectAll("tr").data(endpoints).join("tr");
    endpointRows.append("th").attr("scope", "row").text((row) => row.area);
    endpointRows.append("td").text((row) => formatGap(row.start) + " pp");
    endpointRows.append("td").text((row) => formatGap(row.end) + " pp");
    endpointRows.append("td").text((row) => {
      if (Math.abs(row.change) < 0.05) return "Stable";
      return formatDecimal(Math.abs(row.change)) + " pp " + (row.change > 0 ? "wider" : "narrower");
    });

    const largestEnd = d3.greatest(endpoints, (row) => Math.abs(row.end));
    const remote = endpoints[areas.indexOf("Remote")];
    const regional = endpoints[areas.indexOf("Regional")];
    const changed = (row) => row.area + "’s gap " + (row.change > 0 ? "widened" : "narrowed") +
      " by " + formatDecimal(Math.abs(row.change)) + " percentage points";
    d3.select("#q5-takeaway").text(
      largestEnd.area + " had the largest gap in " + lastYear + ". From " + firstYear +
      " to " + lastYear + ", " + changed(remote) + " and " + changed(regional) + "."
    );

    function updateSelection() {
      showDetails(selected);
      areaControl.property("value", selected.area);
      endpointRows.classed("q5-selected-area", (row) => row.area === selected.area);
      d3.select("#q5-trend-summary").text(
        selected.area + " · " + selected.year + " gap " + formatGap(selected.gap) +
        " percentage points. Dashed horizontal line shows zero."
      );
    }

    function selectCell(row) {
      selected = row;
      keyboardCell = row;
      updateCells();
      updateSelection();
      drawTrend();
    }

    heatmap.on("pointerleave", () => showDetails(selected));
    heatmap.on("focusout", (event) => {
      if (!heatmap.node().contains(event.relatedTarget)) showDetails(selected);
    });
    updateSelection();

    function resizeCharts() {
      const width = Math.floor(trend.node().getBoundingClientRect().width);
      if (width < 120 || width === chartWidth) return;
      chartWidth = width;
      const nextCompact = width < 620;
      if (nextCompact !== compact) {
        const hadFocus = heatmap.node().contains(document.activeElement);
        compact = nextCompact;
        drawHeatmap();
        if (hadFocus) cells.filter((row) => row === keyboardCell).node().focus({ preventScroll: true });
      }
      drawTrend();
    }

    visualisations.hidden = false;
    status.hidden = true;
    resizeCharts();
    new ResizeObserver(resizeCharts).observe(trend.node());
  }

  d3.csv("data/processed/q5_remoteness_gap.csv", parseRow)
    .then((rows) => renderQ5(rows, validateRows(rows)))
    .catch((error) => {
      visualisations.hidden = true;
      status.hidden = false;
      status.textContent = "The Q5 data could not be loaded. Reload the page to try again.";
      console.error("Q5 visualisation failed:", error);
    });
})();
