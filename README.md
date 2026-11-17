# Hospitalised Injuries from Road Crashes in Australia

Group 19 project for COS30045 Data Visualisation at Swinburne University. This project visualises hospitalised injuries from road crashes in Australia using BITRE data.

## Preview the website locally

From the repository folder, run:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser. Keep the server running while viewing the site. D3 loads from jsDelivr.

## Add charts to the layout

The homepage (`index.html`) introduces the study and links to five question pages (`q1.html` to `q5.html`). Use each page’s matching chart container, from `#chart-q1` to `#chart-q5`.

Put each chart in a separate script in `js/`, such as `js/q1.js`. On its question page, add a deferred D3 script and then the deferred chart script. Replace the `Chart pending` text when the chart renders. Keep the chart within its container on small screens.

## Explore Q5

Choose a heatmap cell to update the residence-area trend and inspect the two shares. Use the arrow keys to move between cells and Enter or Space to select one. The area dropdown keeps the selected year and switches the trend to another area. In a narrow chart, the heatmap displays years as rows.

## Folder structure

- `css/` — website styles
- `js/` — website JavaScript
- `data/raw/` — original BITRE data files
- `data/processed/` — CSVs output from KNIME
- `knime/` — KNIME workflow files
