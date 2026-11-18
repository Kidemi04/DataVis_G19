(() => {
  "use strict";

  const panel = document.getElementById("chart-q2");
  if (!panel) {
    console.error("Q2 chart panel could not be found.");
    return;
  }

  const status = panel.querySelector(".chart-placeholder") || document.createElement("p");
  status.className = "q2-status";
  status.setAttribute("role", "status");
  status.textContent = "Loading Q2 data…";
  if (!status.parentNode) panel.append(status);

  const d3 = window.d3;
  if (!d3) {
    status.textContent = "Q2 needs the D3 library. Check your connection and reload the page.";
    return;
  }

  const ageGroups = ["0-7", "8-16", "17-25", "26-39", "40-64", "65-74", "75+"];
  const ages = ["All ages", ...ageGroups];
  const roadUsers = [
    { name: "Car occupant", colour: "#0072B2" },
    { name: "Motorcyclist", colour: "#E69F00" },
    { name: "Pedal cyclist", shortName: "Cyclist", colour: "#D55E00" },
    { name: "Pedestrian", colour: "#009E73" },
    { name: "Heavy vehicle, bus or van", shortName: "Heavy vehicle", colour: "#999999" },
    { name: "Other or unknown", shortName: "Other/unknown", colour: "#BBBBBB" },
  ];
  const formatNumber = d3.format(",d");
  const formatDays = d3.format(".1f");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function parseRow(row) {
    return {
      age: row["Age group"]?.trim(),
      group: row.road_user_group?.trim(),
      hospitalisations: Number(row.Hospitalisations),
      bedDays: Number(row.nf_bed_days),
      averageStay: Number(row.avg_stay_days),
    };
  }

  function validateRows(rows) {
    const expectedGroups = new Set(roadUsers.map((group) => group.name));
    const byAgeAndGroup = d3.index(rows, (row) => row.age, (row) => row.group);
    if (rows.length !== ageGroups.length * roadUsers.length) {
      throw new Error("Q2 data must contain one row for every age and road user group.");
    }

    for (const row of rows) {
      if (!ageGroups.includes(row.age) || !expectedGroups.has(row.group) ||
          !Number.isInteger(row.hospitalisations) || row.hospitalisations <= 0 ||
          !Number.isInteger(row.bedDays) || row.bedDays < 0 ||
          !Number.isFinite(row.averageStay) || row.averageStay < 0) {
        throw new Error("Q2 data contains an invalid age, group, or hospitalisation value.");
      }
    }

    for (const age of ageGroups) {
      for (const group of roadUsers) {
        if (!byAgeAndGroup.get(age)?.get(group.name)) {
          throw new Error("Q2 data is missing " + group.name + " for age " + age + ".");
        }
      }
    }

    const allAges = roadUsers.map((group) => {
      const ageRows = ageGroups.map((age) => byAgeAndGroup.get(age).get(group.name));
      const hospitalisations = d3.sum(ageRows, (row) => row.hospitalisations);
      const bedDays = d3.sum(ageRows, (row) => row.bedDays);
      return {
        age: "All ages",
        group: group.name,
        hospitalisations,
        bedDays,
        averageStay: bedDays / hospitalisations,
      };
    });

    return { byAgeAndGroup, allAges };
  }

  function renderChart(data) {
    const heading = document.createElement("h2");
    heading.className = "q2-heading";

    const takeaway = document.createElement("p");
    takeaway.className = "q2-takeaway";
    takeaway.setAttribute("aria-live", "polite");

    const controls = document.createElement("div");
    controls.className = "q2-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Filter by age group");
    const ageButtons = new Map();
    for (const age of ages) {
      const button = document.createElement("button");
      button.className = "q2-age-button";
      button.type = "button";
      button.textContent = age;
      button.setAttribute("aria-pressed", String(age === "All ages"));
      button.setAttribute("aria-controls", "q2-chart");
      button.addEventListener("click", () => setAge(age));
      ageButtons.set(age, button);
      controls.append(button);
    }

    const legend = document.createElement("div");
    legend.className = "q2-size-legend";
    legend.setAttribute("aria-label", "Bubble area represents total non-fatal bed days");
    const legendTitle = document.createElement("span");
    legendTitle.className = "q2-legend-title";
    legendTitle.textContent = "Total bed days";
    legend.append(legendTitle);

    const chartContainer = document.createElement("div");
    chartContainer.className = "q2-chart";
    const tooltip = document.createElement("div");
    tooltip.className = "q2-tooltip";
    tooltip.id = "q2-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    chartContainer.append(tooltip);

    const note = document.createElement("p");
    note.className = "q2-chart-note";
    note.textContent = "Average stay = non-fatal bed days ÷ hospitalisations, weighted across groups. Length of stay is a proxy for severity. Bed-day counting rules changed in 2015–16. Source: BITRE (2023).";
    panel.replaceChildren(heading, takeaway, controls, legend, chartContainer, note);

    const svg = d3.select(chartContainer).append("svg")
      .attr("id", "q2-chart")
      .attr("role", "img");
    const grid = svg.append("g").attr("class", "q2-grid");
    const xAxis = svg.append("g").attr("class", "q2-axis");
    const yAxis = svg.append("g").attr("class", "q2-axis");
    const axesTitles = svg.append("g").attr("class", "q2-axis-title");
    const bubbleLayer = svg.append("g").attr("class", "q2-bubbles");
    let selectedAge = "All ages";
    let chartWidth = 0;
    let chartHeight = 440;
    let hoveredGroup = null;
    let focusedGroup = null;

    function rowsForAge(age) {
      if (age === "All ages") return data.allAges;
      return roadUsers.map((group) => data.byAgeAndGroup.get(age).get(group.name));
    }

    function displayName(group) {
      if (group === "Pedestrian") return "Pedestrians";
      if (group === "Motorcyclist") return "Motorcyclists";
      if (group === "Pedal cyclist") return "Pedal cyclists";
      if (group === "Car occupant") return "Car occupants";
      if (group === "Heavy vehicle, bus or van") return "Heavy vehicle, bus or van occupants";
      return "People in the other or unknown group";
    }

    function updateSummary(rows) {
      const longest = d3.greatest(rows, (row) => row.averageStay);
      const shortest = d3.least(rows, (row) => row.averageStay);
      heading.textContent = displayName(longest.group) + " have the longest hospital stays";
      takeaway.textContent = displayName(longest.group) + " had the longest average stay at " +
        formatDays(longest.averageStay) + " days. " + displayName(shortest.group) +
        " had the shortest average stay at " + formatDays(shortest.averageStay) + " days.";
    }

    function updateLegend(size) {
      legend.querySelectorAll(".q2-legend-item").forEach((item) => item.remove());
      const maximum = d3.max(size.domain());
      for (const value of [maximum / 4, maximum / 2, maximum]) {
        const item = document.createElement("span");
        item.className = "q2-legend-item";
        const circle = document.createElement("span");
        circle.className = "q2-legend-circle";
        circle.style.width = (size(value) * 2) + "px";
        circle.style.height = (size(value) * 2) + "px";
        const label = document.createElement("span");
        label.textContent = formatNumber(Math.round(value));
        item.append(circle, label);
        legend.append(item);
      }
    }

    function updateTooltip(row, pointerEvent) {
      tooltip.textContent = row.group + " · " + selectedAge + " – " +
        formatNumber(row.hospitalisations) + " cases · " + formatDays(row.averageStay) +
        " days avg · " + formatNumber(row.bedDays) + " bed days";
      tooltip.hidden = false;
      const bounds = chartContainer.getBoundingClientRect();
      let x;
      let y;
      if (pointerEvent) {
        [x, y] = d3.pointer(pointerEvent, chartContainer);
      } else {
        x = row.cx / chartWidth * bounds.width;
        y = row.cy / chartHeight * bounds.height;
      }
      const tooltipWidth = tooltip.getBoundingClientRect().width;
      tooltip.style.left = Math.max(4, Math.min(x - tooltipWidth / 2, bounds.width - tooltipWidth - 4)) + "px";
      tooltip.style.top = Math.max(4, y - 44) + "px";
    }

    function updateTooltipForActive() {
      const activeGroup = hoveredGroup || focusedGroup;
      if (!activeGroup) {
        tooltip.hidden = true;
        return;
      }
      const row = rowsForAge(selectedAge).find((item) => item.group === activeGroup);
      if (row) updateTooltip(row);
    }

    function draw(width, animate) {
      const compact = width < 500;
      chartHeight = compact ? 470 : 440;
      const margin = {
        top: 28,
        right: compact ? 22 : 34,
        bottom: compact ? 68 : 60,
        left: compact ? 54 : 66,
      };
      const plotLeft = margin.left;
      const plotRight = width - margin.right;
      const plotTop = margin.top;
      const plotBottom = chartHeight - margin.bottom;
      const rows = rowsForAge(selectedAge);
      const xMaximum = d3.max(rows, (row) => row.hospitalisations);
      const yMaximum = d3.max(rows, (row) => row.averageStay);
      const bedDayMaximum = d3.max(rows, (row) => row.bedDays);
      const x = d3.scaleLinear()
        .domain([0, xMaximum * 1.12])
        .nice()
        .range([plotLeft, plotRight]);
      const y = d3.scaleLinear()
        .domain([0, yMaximum * 1.2])
        .nice()
        .range([plotBottom, plotTop]);
      const radius = d3.scaleSqrt()
        .domain([0, bedDayMaximum])
        .range([0, compact ? 25 : 31]);
      const points = rows.map((row) => ({
        ...row,
        roadUser: roadUsers.find((group) => group.name === row.group),
        cx: x(row.hospitalisations),
        cy: y(row.averageStay),
        radius: radius(row.bedDays),
      }));
      const transition = (selection) => {
        const current = selection.interrupt();
        return animate && !reducedMotion.matches ? current.transition().duration(700) : current;
      };

      svg.attr("viewBox", "0 0 " + width + " " + chartHeight)
        .attr("aria-label", (selectedAge === "All ages" ? "All ages" : "Age " + selectedAge) +
          " hospitalisations by road user group. Bubble area represents total non-fatal bed days. " +
          rows.map((row) => row.group + ": " + formatNumber(row.hospitalisations) +
            " hospitalisations, " + formatDays(row.averageStay) + " average stay days, " +
            formatNumber(row.bedDays) + " bed days.").join(" "));

      const gridTicks = y.ticks(5);
      const gridLines = grid.selectAll("line")
        .data(gridTicks, (value) => value);
      gridLines.exit().remove();
      transition(gridLines.enter().append("line")
        .attr("x1", plotLeft).attr("x2", plotRight)
        .attr("y1", (value) => y(value)).attr("y2", (value) => y(value)))
        .attr("x1", plotLeft).attr("x2", plotRight)
        .attr("y1", (value) => y(value)).attr("y2", (value) => y(value));
      transition(gridLines)
        .attr("x1", plotLeft).attr("x2", plotRight)
        .attr("y1", (value) => y(value)).attr("y2", (value) => y(value));

      const xAxisGenerator = d3.axisBottom(x).ticks(compact ? 4 : 5)
        .tickFormat(d3.format("~s")).tickSizeOuter(0);
      const yAxisGenerator = d3.axisLeft(y).ticks(5).tickSizeOuter(0);
      if (animate && !reducedMotion.matches) {
        xAxis.interrupt().transition().duration(700).call(xAxisGenerator)
          .attr("transform", "translate(0," + plotBottom + ")");
        yAxis.interrupt().transition().duration(700).call(yAxisGenerator)
          .attr("transform", "translate(" + plotLeft + ",0)");
      } else {
        xAxis.interrupt().attr("transform", "translate(0," + plotBottom + ")").call(xAxisGenerator);
        yAxis.interrupt().attr("transform", "translate(" + plotLeft + ",0)").call(yAxisGenerator);
      }

      axesTitles.selectAll("text").remove();
      axesTitles.append("text")
        .attr("class", "q2-axis-label")
        .attr("x", (plotLeft + plotRight) / 2)
        .attr("y", chartHeight - 8)
        .attr("text-anchor", "middle")
        .text("Number of hospitalisations");
      axesTitles.append("text")
        .attr("class", "q2-axis-label")
        .attr("transform", "translate(15," + ((plotTop + plotBottom) / 2) + ") rotate(-90)")
        .attr("text-anchor", "middle")
        .text("Average stay (days)");

      const bubbles = bubbleLayer.selectAll(".q2-bubble")
        .data(points, (row) => row.group)
        .join("circle")
        .attr("class", "q2-bubble")
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr("aria-describedby", "q2-tooltip")
        .on("pointerenter", function (event, row) {
          hoveredGroup = row.group;
          updateTooltip(row, event);
        })
        .on("pointermove", function (event, row) {
          if (hoveredGroup === row.group) updateTooltip(row, event);
        })
        .on("pointerleave", function () {
          hoveredGroup = null;
          updateTooltipForActive();
        })
        .on("focus", function (_, row) {
          focusedGroup = row.group;
          updateTooltip(row);
        })
        .on("blur", function () {
          focusedGroup = null;
          updateTooltipForActive();
        })
        .attr("aria-label", (row) => row.group + " · " + selectedAge + " – " +
          formatNumber(row.hospitalisations) + " cases · " + formatDays(row.averageStay) +
          " days average · " + formatNumber(row.bedDays) + " bed days")
        .attr("fill", (row) => row.roadUser.colour);

      transition(bubbles)
        .attr("cx", (row) => row.cx)
        .attr("cy", (row) => row.cy)
        .attr("r", (row) => row.radius);

      const labels = bubbleLayer.selectAll(".q2-bubble-label")
        .data(points, (row) => row.group)
        .join("text")
        .attr("class", "q2-bubble-label")
        .attr("fill", (row) => row.roadUser.colour)
        .text((row) => (compact ? row.roadUser.shortName || row.group : row.group) +
          " · " + formatDays(row.averageStay) + " d");

      const placed = [];
      const labelHeight = compact ? 13 : 15;
      const gap = compact ? 5 : 8;
      const candidates = [];
      for (const side of ["right", "left", "middle"]) {
        for (let distance = 0; distance <= 10; distance += 1) {
          if (distance === 0) {
            candidates.push({ side, dy: 0 });
          } else {
            candidates.push({ side, dy: -distance * labelHeight });
            candidates.push({ side, dy: distance * labelHeight });
          }
        }
      }

      for (const point of points.slice().sort((a, b) => a.cy - b.cy)) {
        const label = labels.filter((row) => row.group === point.group).node();
        const labelWidth = label.getComputedTextLength();
        const options = candidates.map((candidate, index) => {
          const anchor = candidate.side === "left" ? "end" :
            candidate.side === "middle" ? "middle" : "start";
          const textX = candidate.side === "left" ? point.cx - point.radius - gap :
            candidate.side === "right" ? point.cx + point.radius + gap : point.cx;
          const textY = point.cy + candidate.dy;
          const left = anchor === "end" ? textX - labelWidth :
            anchor === "middle" ? textX - labelWidth / 2 : textX;
          const right = left + labelWidth;
          const top = textY - labelHeight / 2;
          const bottom = top + labelHeight;
          const outside = Math.max(0, plotLeft - left) + Math.max(0, right - plotRight) +
            Math.max(0, plotTop - top) + Math.max(0, bottom - plotBottom);
          const bubbleOverlap = points.reduce((sum, other) => {
            const closestX = Math.max(left, Math.min(other.cx, right));
            const closestY = Math.max(top, Math.min(other.cy, bottom));
            return sum + (Math.hypot(other.cx - closestX, other.cy - closestY) <
              other.radius + 2 ? 10000 : 0);
          }, 0);
          const labelOverlap = placed.reduce((sum, other) =>
            sum + (left < other.right + 3 && right + 3 > other.left &&
              top < other.bottom + 2 && bottom + 2 > other.top ? 100000 : 0), 0);
          return {
            anchor, textX, textY, left, right, top, bottom,
            score: outside * 1000000 + bubbleOverlap + labelOverlap + index * 0.1,
          };
        }).sort((a, b) => a.score - b.score);
        const chosen = options[0];
        transition(d3.select(label))
          .attr("x", chosen.textX)
          .attr("y", chosen.textY)
          .attr("text-anchor", chosen.anchor);
        placed.push(chosen);
      }

      updateSummary(rows);
      updateLegend(radius);
      updateTooltipForActive();
    }

    function setAge(age) {
      if (age === selectedAge) return;
      selectedAge = age;
      for (const [name, button] of ageButtons) {
        button.setAttribute("aria-pressed", String(name === selectedAge));
      }
      draw(chartWidth, true);
    }

    function resizeChart() {
      const width = Math.floor(chartContainer.getBoundingClientRect().width);
      if (width < 240 || width === chartWidth) return;
      chartWidth = width;
      draw(width, false);
    }

    resizeChart();
    new ResizeObserver(resizeChart).observe(chartContainer);
  }

  d3.csv("data/processed/q2_severity.csv", parseRow)
    .then((rows) => renderChart(validateRows(rows)))
    .catch((error) => {
      panel.replaceChildren(status);
      status.textContent = "The Q2 data could not be loaded. Reload the page to try again.";
      console.error("Q2 visualisation failed:", error);
    });
})();
