(() => {
  "use strict";

  const panel = document.getElementById("chart-q1");
  if (!panel) {
    console.error("Q1 chart panel could not be found.");
    return;
  }

  const status = panel.querySelector(".chart-placeholder") || document.createElement("p");
  status.className = "q1-status";
  status.setAttribute("role", "status");
  status.textContent = "Loading Q1 data…";
  if (!status.parentNode) panel.append(status);

  const d3 = window.d3;
  if (!d3) {
    status.textContent = "Q1 needs the D3 library. Check your connection and reload the page.";
    return;
  }

  const groups = [
    { name: "Car occupant", colour: "#0072B2" },
    { name: "Motorcyclist", colour: "#E69F00" },
    { name: "Pedal cyclist", colour: "#D55E00" },
    { name: "Pedestrian", colour: "#009E73" },
    { name: "Heavy vehicle, bus or van", shortName: "Heavy vehicle", colour: "#999999", muted: true },
    { name: "Other or unknown", shortName: "Other/unknown", colour: "#BBBBBB", muted: true },
  ];
  const firstYear = 2011;
  const lastYear = 2021;
  const formatNumber = d3.format(",d");
  const formatShare = d3.format(".1f");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function parseRow(row) {
    return {
      year: Number(row["Calendar year"]),
      group: row.road_user_group?.trim(),
      count: Number(row.Hospitalisations),
      share: Number(row.share_pct),
    };
  }

  function validateRows(rows) {
    const expectedGroups = new Set(groups.map((group) => group.name));
    const byGroupAndYear = d3.index(rows, (row) => row.group, (row) => row.year);
    if (rows.length !== groups.length * (lastYear - firstYear + 1)) {
      throw new Error("Q1 data must contain one row for each road user group and year.");
    }

    for (const row of rows) {
      if (!Number.isInteger(row.year) || row.year < firstYear || row.year > lastYear ||
          !expectedGroups.has(row.group) || !Number.isInteger(row.count) || row.count < 0 ||
          !Number.isFinite(row.share) || row.share < 0 || row.share > 100) {
        throw new Error("Q1 data contains an invalid year, group, count, or share.");
      }
    }

    for (const group of groups) {
      for (let year = firstYear; year <= lastYear; year += 1) {
        if (!byGroupAndYear.get(group.name)?.get(year)) {
          throw new Error("Q1 data is missing " + group.name + " in " + year + ".");
        }
      }
    }

    return byGroupAndYear;
  }

  function spreadLabels(series, key, value, y, minY, maxY, gap) {
    const labels = series.map((item) => ({
      name: item.group.name,
      targetY: y(value(item[key])),
    })).sort((a, b) => a.targetY - b.targetY);

    labels[0].labelY = Math.max(labels[0].targetY, minY);
    for (let index = 1; index < labels.length; index += 1) {
      labels[index].labelY = Math.max(labels[index].targetY, labels[index - 1].labelY + gap);
    }

    const overflow = labels[labels.length - 1].labelY - maxY;
    if (overflow > 0) {
      for (const label of labels) label.labelY -= overflow;
    }

    return new Map(labels.map((label) => [label.name, label.labelY]));
  }

  function changePercent(start, end) {
    return start === 0 ? null : (end - start) / start * 100;
  }

  function formatChange(change) {
    if (change === null) return "n/a";
    const rounded = Math.round(change);
    if (rounded === 0) return "0%";
    return (rounded > 0 ? "+" : "−") + Math.abs(rounded) + "%";
  }

  function describeChange(name, start, end) {
    const change = changePercent(start, end);
    const direction = change > 0 ? "rose " : change < 0 ? "fell " : "was unchanged at ";
    const amount = change === 0 ? formatNumber(start) : Math.abs(Math.round(change)) + "%";
    return name + " hospitalisations " + direction + amount;
  }

  function renderChart(byGroupAndYear) {
    const series = groups.map((group) => ({
      group,
      start: byGroupAndYear.get(group.name).get(firstYear),
      end: byGroupAndYear.get(group.name).get(lastYear),
    }));
    const cyclist = series.find((item) => item.group.name === "Pedal cyclist");
    const pedestrian = series.find((item) => item.group.name === "Pedestrian");
    const heading = document.createElement("h2");
    heading.className = "q1-heading";
    heading.textContent = "Cyclist injuries grew the fastest";

    const takeaway = document.createElement("p");
    takeaway.className = "q1-takeaway";
    takeaway.textContent = describeChange("Pedal cyclist", cyclist.start.count, cyclist.end.count) +
      " from " + firstYear + " to " + lastYear + ", while " +
      describeChange("pedestrian", pedestrian.start.count, pedestrian.end.count) + ".";

    const controls = document.createElement("div");
    controls.className = "q1-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Chart measure");
    const countButton = document.createElement("button");
    countButton.className = "q1-mode-button";
    countButton.type = "button";
    countButton.textContent = "Count";
    countButton.setAttribute("aria-pressed", "true");
    const shareButton = document.createElement("button");
    shareButton.className = "q1-mode-button";
    shareButton.type = "button";
    shareButton.textContent = "Share %";
    shareButton.setAttribute("aria-pressed", "false");
    controls.append(countButton, shareButton);

    const chartContainer = document.createElement("div");
    chartContainer.className = "q1-chart";
    const tooltip = document.createElement("div");
    tooltip.className = "q1-tooltip";
    tooltip.id = "q1-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    chartContainer.append(tooltip);

    const note = document.createElement("p");
    note.className = "q1-data-note";
    note.textContent = "Non-fatal hospitalisations from road traffic crashes. Victoria (2012) and NSW (2017) changed their admission rules, so some changes over time are not directly comparable. Source: BITRE (2023).";
    panel.replaceChildren(heading, takeaway, controls, chartContainer, note);

    const ariaSummary = series.map((item) =>
      item.group.name + ": " + firstYear + " " + formatNumber(item.start.count) +
      ", " + lastYear + " " + formatNumber(item.end.count)
    ).join("; ");
    const svg = d3.select(chartContainer).append("svg")
      .attr("role", "img")
      .attr("aria-label", "Hospitalisations by road user group. The shared vertical scale starts at zero. " +
        ariaSummary + ".");
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "q1-arrow")
      .attr("viewBox", "0 0 8 8")
      .attr("refX", 7)
      .attr("refY", 4)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,0 L8,4 L0,8 Z");
    const grid = svg.append("g").attr("class", "q1-grid");
    const axes = svg.append("g").attr("class", "q1-axis");
    const years = svg.append("g").attr("class", "q1-year");
    const zeroes = svg.append("g").attr("class", "q1-zero");
    const measureLabel = svg.append("text")
      .attr("class", "q1-measure-label")
      .attr("text-anchor", "middle");
    const seriesLayer = svg.append("g").attr("class", "q1-series-layer");
    const annotationLayer = svg.append("g").attr("class", "q1-annotations");
    const valueOf = (row, mode) => mode === "share" ? row.share : row.count;
    let mode = "count";
    let chartWidth = 0;
    let layout = null;
    let hoveredName = null;
    let focusedName = null;
    let pinnedName = null;

    function formattedValue(row, selectedMode) {
      return selectedMode === "share" ? formatShare(valueOf(row, selectedMode)) + "%" :
        formatNumber(valueOf(row, selectedMode));
    }

    function currentActiveName() {
      return hoveredName || focusedName || pinnedName;
    }

    function updateHighlight() {
      const activeName = currentActiveName();
      seriesLayer.selectAll(".q1-series")
        .classed("q1-dimmed", (item) => activeName !== null && item.group.name !== activeName)
        .classed("q1-highlighted", (item) => item.group.name === activeName);
      annotationLayer.selectAll(".q1-annotation")
        .classed("q1-dimmed", (item) => activeName !== null && item.series.group.name !== activeName);
      seriesLayer.selectAll(".q1-slope")
        .attr("aria-pressed", (item) => String(item.group.name === pinnedName));

      if (activeName) {
        const activeSeries = series.find((item) => item.group.name === activeName);
        showTooltip(activeSeries);
      } else {
        tooltip.hidden = true;
      }
    }

    function showTooltip(item, pointerEvent) {
      const start = valueOf(item.start, mode);
      const end = valueOf(item.end, mode);
      const change = formatChange(changePercent(start, end));
      tooltip.textContent = item.group.name + ": " + formattedValue(item.start, mode) +
        " → " + formattedValue(item.end, mode) + " (" + change + ")";
      tooltip.hidden = false;
      const bounds = chartContainer.getBoundingClientRect();
      let x;
      let y;
      if (pointerEvent) {
        [x, y] = d3.pointer(pointerEvent, chartContainer);
      } else if (layout) {
        x = bounds.width * (layout.leftX + layout.rightX) / (2 * layout.width);
        y = bounds.height * (layout.y(start) + layout.y(end)) / (2 * layout.height);
      } else {
        x = bounds.width / 2;
        y = bounds.height / 2;
      }
      const tooltipWidth = tooltip.getBoundingClientRect().width;
      tooltip.style.left = Math.max(4, Math.min(x - tooltipWidth / 2, bounds.width - tooltipWidth - 4)) + "px";
      tooltip.style.top = Math.max(4, y - 42) + "px";
    }

    function togglePinned(item) {
      pinnedName = pinnedName === item.group.name ? null : item.group.name;
      updateHighlight();
    }

    function handlePointerEnter(event, item) {
      hoveredName = item.group.name;
      updateHighlight();
      showTooltip(item, event);
    }

    function handlePointerMove(event, item) {
      if (hoveredName === item.group.name) showTooltip(item, event);
    }

    function handlePointerLeave() {
      hoveredName = null;
      updateHighlight();
    }

    function draw(width, animate) {
      const compact = width < 500;
      const height = compact ? 390 : 340;
      const margin = {
        top: 38,
        right: compact ? 48 : 78,
        bottom: 28,
        left: compact ? Math.min(140, width * 0.43) : Math.min(235, width * 0.46),
      };
      const leftX = margin.left;
      const rightX = width - margin.right;
      const plotTop = margin.top;
      const plotBottom = height - margin.bottom;
      const currentValue = (row) => valueOf(row, mode);
      const maxValue = d3.max(series, (item) =>
        Math.max(currentValue(item.start), currentValue(item.end))
      );
      const y = d3.scaleLinear()
        .domain([0, maxValue])
        .nice()
        .range([plotBottom, plotTop]);
      const labelGap = compact ? 19 : 21;
      const leftLabels = spreadLabels(series, "start", currentValue, y, plotTop + 8, plotBottom - 6, labelGap);
      const rightLabels = spreadLabels(series, "end", currentValue, y, plotTop + 8, plotBottom - 6, labelGap);
      const transition = (selection) => {
        if (!animate || reducedMotion.matches) return selection;
        return selection.interrupt().transition().duration(600);
      };
      layout = { width, height, leftX, rightX, y };

      svg.attr("viewBox", "0 0 " + width + " " + height);
      svg.attr("aria-label", (mode === "share" ? "Share of hospitalisations" : "Hospitalisations") +
        " by road user group. The shared vertical scale starts at zero. " +
        series.map((item) => item.group.name + ": " + firstYear + " " +
          formattedValue(item.start, mode) + ", " + lastYear + " " +
          formattedValue(item.end, mode)).join("; ") + ".");
      const ticks = y.ticks(4).filter((value) => value > 0);
      const gridLines = grid.selectAll("line").data(ticks, (value) => value);
      gridLines.exit().remove();
      transition(gridLines.enter().append("line")
        .attr("x1", leftX).attr("x2", rightX)
        .attr("y1", (value) => y(value)).attr("y2", (value) => y(value)))
        .attr("x1", leftX).attr("x2", rightX)
        .attr("y1", (value) => y(value)).attr("y2", (value) => y(value));
      transition(gridLines)
        .attr("x1", leftX).attr("x2", rightX)
        .attr("y1", (value) => y(value)).attr("y2", (value) => y(value));

      axes.selectAll("line.q1-axis-line")
        .data([leftX, rightX])
        .join("line")
        .attr("class", "q1-axis-line")
        .attr("x1", (x) => x).attr("x2", (x) => x)
        .attr("y1", plotTop).attr("y2", plotBottom);
      axes.selectAll("line.q1-zero-tick")
        .data([leftX, rightX])
        .join("line")
        .attr("class", "q1-zero-tick")
        .attr("x1", (x) => x - 4).attr("x2", (x) => x + 4)
        .attr("y1", plotBottom).attr("y2", plotBottom);
      years.selectAll("text").data([{ year: firstYear, x: leftX }, { year: lastYear, x: rightX }])
        .join("text")
        .attr("x", (item) => item.x).attr("y", 20)
        .attr("text-anchor", "middle").text((item) => item.year);
      zeroes.selectAll("text").data([leftX, rightX])
        .join("text")
        .attr("x", (x) => x).attr("y", height - 7)
        .attr("text-anchor", "middle")
        .text(mode === "share" ? "0%" : "0");
      measureLabel
        .attr("transform", "translate(12," + ((plotTop + plotBottom) / 2) + ") rotate(-90)")
        .text(mode === "share" ? "Share of hospitalisations (%)" : "Hospitalisations");

      const seriesGroups = seriesLayer.selectAll(".q1-series")
        .data(series, (item) => item.group.name)
        .join((enter) => {
          const group = enter.append("g").attr("class", "q1-series");
          group.append("line").attr("class", "q1-hit-target")
            .attr("aria-hidden", "true")
            .on("pointerenter", handlePointerEnter)
            .on("pointermove", handlePointerMove)
            .on("pointerleave", handlePointerLeave)
            .on("click", function (_, item) {
              togglePinned(item);
            });
          group.append("line").attr("class", "q1-slope")
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-describedby", "q1-tooltip")
            .on("pointerenter", handlePointerEnter)
            .on("pointermove", handlePointerMove)
            .on("pointerleave", handlePointerLeave)
            .on("focus", function (_, item) {
              focusedName = item.group.name;
              updateHighlight();
            })
            .on("blur", function () {
              focusedName = null;
              updateHighlight();
            })
            .on("click", function (_, item) {
              togglePinned(item);
            })
            .on("keydown", function (event, item) {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                togglePinned(item);
              }
            });
          group.append("circle").attr("class", "q1-start-dot");
          group.append("circle").attr("class", "q1-end-dot");
          group.append("line").attr("class", "q1-start-leader");
          group.append("line").attr("class", "q1-end-leader");
          group.append("text").attr("class", "q1-start-label");
          group.append("text").attr("class", "q1-end-label");
          return group;
        });

      seriesGroups.select(".q1-slope")
        .attr("aria-label", (item) => item.group.name + ": " +
          formattedValue(item.start, mode) + " in " + firstYear + ", " +
          formattedValue(item.end, mode) + " in " + lastYear + ". Activate to highlight.")
        .attr("aria-pressed", (item) => String(item.group.name === pinnedName))
        .attr("stroke", (item) => item.group.colour)
        .classed("q1-slope-muted", (item) => item.group.muted);
      transition(seriesGroups.selectAll(".q1-hit-target, .q1-slope"))
        .attr("x1", leftX).attr("x2", rightX)
        .attr("y1", (item) => y(currentValue(item.start)))
        .attr("y2", (item) => y(currentValue(item.end)));

      const updateEndpoint = (side, key, x, direction, labels) => {
        transition(seriesGroups.select(".q1-" + side + "-dot"))
          .attr("cx", x)
          .attr("cy", (item) => y(currentValue(item[key])))
          .attr("r", 4)
          .attr("fill", (item) => item.group.colour);
        transition(seriesGroups.select(".q1-" + side + "-leader"))
          .attr("x1", x)
          .attr("x2", x + direction * 8)
          .attr("y1", (item) => y(currentValue(item[key])))
          .attr("y2", (item) => labels.get(item.group.name))
          .attr("stroke", (item) => item.group.colour)
          .attr("opacity", (item) => Math.abs(y(currentValue(item[key])) -
            labels.get(item.group.name)) > 2 ? 1 : 0);
        transition(seriesGroups.select(".q1-" + side + "-label"))
          .attr("x", x + direction * 11)
          .attr("y", (item) => labels.get(item.group.name))
          .attr("dy", "0.35em")
          .attr("text-anchor", direction < 0 ? "end" : "start")
          .attr("fill", (item) => item.group.colour)
          .text((item) => {
            const label = direction < 0
              ? (compact ? item.group.shortName || item.group.name : item.group.name) + " "
              : "";
            return label + formattedValue(item[key], mode);
          });
      };
      updateEndpoint("start", "start", leftX, -1, leftLabels);
      updateEndpoint("end", "end", rightX, 1, rightLabels);

      const changes = series.map((item) => ({
        series: item,
        change: changePercent(currentValue(item.start), currentValue(item.end)),
      })).filter((item) => item.change !== null);
      const annotations = [
        d3.greatest(changes.filter((item) => item.change > 0), (item) => item.change),
        d3.least(changes.filter((item) => item.change < 0), (item) => item.change),
      ].filter(Boolean).map((item, index) => ({
        ...item,
        fraction: index === 0 ? 0.34 : 0.68,
        sign: index === 0 ? 1 : -1,
        label: formatChange(item.change),
      }));
      const annotationGroups = annotationLayer.selectAll(".q1-annotation")
        .data(annotations, (item) => item.series.group.name)
        .join((enter) => {
          const group = enter.append("g").attr("class", "q1-annotation");
          group.append("line").attr("class", "q1-annotation-arrow")
            .attr("marker-end", "url(#q1-arrow)");
          group.append("text").attr("class", "q1-annotation-label");
          return group;
        });
      annotationGroups
        .attr("fill", (item) => item.series.group.colour)
        .attr("color", (item) => item.series.group.colour);
      transition(annotationGroups.select(".q1-annotation-label"))
        .attr("x", (item) => leftX + (rightX - leftX) * item.fraction)
        .attr("y", (item) => {
          const targetY = y(currentValue(item.series.start)) +
            (y(currentValue(item.series.end)) - y(currentValue(item.series.start))) * item.fraction;
          return Math.max(plotTop + 12, Math.min(plotBottom - 10, targetY - item.sign * 21));
        })
        .text((item) => item.label);
      transition(annotationGroups.select(".q1-annotation-arrow"))
        .attr("x1", (item) => leftX + (rightX - leftX) * item.fraction)
        .attr("x2", (item) => leftX + (rightX - leftX) * item.fraction)
        .attr("y1", (item) => {
          const targetY = y(currentValue(item.series.start)) +
            (y(currentValue(item.series.end)) - y(currentValue(item.series.start))) * item.fraction;
          return Math.max(plotTop + 12, Math.min(plotBottom - 10, targetY - item.sign * 21)) +
            item.sign * 5;
        })
        .attr("y2", (item) => y(currentValue(item.series.start)) +
          (y(currentValue(item.series.end)) - y(currentValue(item.series.start))) * item.fraction)
        .attr("stroke", (item) => item.series.group.colour);

      updateHighlight();
    }

    function setMode(nextMode) {
      if (mode === nextMode) return;
      mode = nextMode;
      countButton.setAttribute("aria-pressed", String(mode === "count"));
      shareButton.setAttribute("aria-pressed", String(mode === "share"));
      draw(chartWidth, true);
      updateHighlight();
    }

    countButton.addEventListener("click", () => setMode("count"));
    shareButton.addEventListener("click", () => setMode("share"));

    function resizeChart() {
      const width = Math.floor(chartContainer.getBoundingClientRect().width);
      if (width < 240 || width === chartWidth) return;
      chartWidth = width;
      draw(width, false);
    }

    resizeChart();
    new ResizeObserver(resizeChart).observe(chartContainer);
  }

  d3.csv("data/processed/q1_road_user_trend.csv", parseRow)
    .then((rows) => renderChart(validateRows(rows)))
    .catch((error) => {
      panel.replaceChildren(status);
      status.textContent = "The Q1 data could not be loaded. Reload the page to try again.";
      console.error("Q1 visualisation failed:", error);
    });
})();
