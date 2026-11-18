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

  function parseRow(row) {
    return {
      year: Number(row["Calendar year"]),
      group: row.road_user_group?.trim(),
      count: Number(row.Hospitalisations),
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
          !expectedGroups.has(row.group) || !Number.isInteger(row.count) || row.count < 0) {
        throw new Error("Q1 data contains an invalid year, group, or hospitalisation count.");
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

  function spreadLabels(series, year, y, minY, maxY, gap) {
    const labels = series.map((item) => ({
      name: item.group.name,
      targetY: y(item[year === firstYear ? "start" : "end"].count),
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

  function changeDescription(group, start, end) {
    const change = Math.round((end - start) / start * 100);
    if (change === 0) return group + " hospitalisations remained unchanged";
    return group + " hospitalisations " + (change > 0 ? "rose " : "fell ") +
      Math.abs(change) + "%";
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
    takeaway.textContent = changeDescription(cyclist.group.name, cyclist.start.count, cyclist.end.count) +
      " from " + firstYear + " to " + lastYear + ", while " +
      changeDescription(pedestrian.group.name, pedestrian.start.count, pedestrian.end.count) + ".";

    const chartContainer = document.createElement("div");
    chartContainer.className = "q1-chart";
    panel.replaceChildren(heading, takeaway, chartContainer);

    const ariaSummary = series.map((item) =>
      item.group.name + ": " + firstYear + " " + formatNumber(item.start.count) +
      ", " + lastYear + " " + formatNumber(item.end.count)
    ).join("; ");
    let chartWidth = 0;

    function draw(width) {
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
      const maxCount = d3.max(series, (item) => Math.max(item.start.count, item.end.count));
      const y = d3.scaleLinear()
        .domain([0, maxCount])
        .nice()
        .range([plotBottom, plotTop]);
      const labelGap = compact ? 19 : 21;
      const leftLabels = spreadLabels(series, firstYear, y, plotTop + 8, plotBottom - 6, labelGap);
      const rightLabels = spreadLabels(series, lastYear, y, plotTop + 8, plotBottom - 6, labelGap);
      const svg = d3.select(chartContainer).selectAll("svg").data([null]).join("svg")
        .attr("viewBox", "0 0 " + width + " " + height)
        .attr("role", "img")
        .attr("aria-label", "Hospitalisations by road user group. The shared vertical scale starts at zero. " +
          ariaSummary + ".");
      svg.selectAll("*").remove();

      const grid = svg.append("g").attr("class", "q1-grid");
      grid.selectAll("line")
        .data(y.ticks(4).filter((value) => value > 0))
        .join("line")
        .attr("x1", leftX)
        .attr("x2", rightX)
        .attr("y1", (value) => y(value))
        .attr("y2", (value) => y(value));

      const axes = svg.append("g").attr("class", "q1-axis");
      axes.selectAll("line.q1-axis-line")
        .data([leftX, rightX])
        .join("line")
        .attr("class", "q1-axis-line")
        .attr("x1", (x) => x)
        .attr("x2", (x) => x)
        .attr("y1", plotTop)
        .attr("y2", plotBottom);
      axes.selectAll("line.q1-zero-tick")
        .data([leftX, rightX])
        .join("line")
        .attr("class", "q1-zero-tick")
        .attr("x1", (x) => x - 4)
        .attr("x2", (x) => x + 4)
        .attr("y1", plotBottom)
        .attr("y2", plotBottom);

      svg.append("g").attr("class", "q1-year")
        .selectAll("text")
        .data([{ year: firstYear, x: leftX }, { year: lastYear, x: rightX }])
        .join("text")
        .attr("x", (item) => item.x)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .text((item) => item.year);
      svg.append("g").attr("class", "q1-zero")
        .selectAll("text")
        .data([leftX, rightX])
        .join("text")
        .attr("x", (x) => x)
        .attr("y", height - 7)
        .attr("text-anchor", "middle")
        .text("0");

      const lines = svg.append("g");
      lines.selectAll("line.q1-slope")
        .data(series)
        .join("line")
        .attr("class", "q1-slope")
        .attr("x1", leftX)
        .attr("x2", rightX)
        .attr("y1", (item) => y(item.start.count))
        .attr("y2", (item) => y(item.end.count))
        .attr("stroke", (item) => item.group.colour)
        .classed("q1-slope-muted", (item) => item.group.muted);

      for (const side of [
        { year: firstYear, x: leftX, direction: -1, labels: leftLabels },
        { year: lastYear, x: rightX, direction: 1, labels: rightLabels },
      ]) {
        const key = side.year === firstYear ? "start" : "end";
        const pointData = series.map((item) => ({
          ...item,
          pointY: y(item[key].count),
          labelY: side.labels.get(item.group.name),
        }));
        const endpoints = svg.append("g");
        endpoints.selectAll("circle")
          .data(pointData)
          .join("circle")
          .attr("class", "q1-dot")
          .attr("cx", side.x)
          .attr("cy", (item) => item.pointY)
          .attr("r", 4)
          .attr("fill", (item) => item.group.colour);
        endpoints.selectAll("line.q1-label-leader")
          .data(pointData.filter((item) => Math.abs(item.pointY - item.labelY) > 2))
          .join("line")
          .attr("class", "q1-label-leader")
          .attr("x1", side.x)
          .attr("x2", side.x + side.direction * 8)
          .attr("y1", (item) => item.pointY)
          .attr("y2", (item) => item.labelY)
          .attr("stroke", (item) => item.group.colour);
        endpoints.selectAll("text")
          .data(pointData)
          .join("text")
          .attr("class", "q1-endpoint-label")
          .attr("x", side.x + side.direction * 11)
          .attr("y", (item) => item.labelY)
          .attr("dy", "0.35em")
          .attr("text-anchor", side.direction < 0 ? "end" : "start")
          .attr("fill", (item) => item.group.colour)
          .text((item) => side.direction < 0
            ? (compact ? item.group.shortName || item.group.name : item.group.name) +
              " " + formatNumber(item[key].count)
            : formatNumber(item[key].count));
      }
    }

    function resizeChart() {
      const width = Math.floor(chartContainer.getBoundingClientRect().width);
      if (width < 240 || width === chartWidth) return;
      chartWidth = width;
      draw(width);
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
