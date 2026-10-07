# Geospatial WebAR Playground

A location-based WebAR playground for viewing JSON-defined anchors on a 2D map and through a mobile camera at real-world coordinates.

## Language

**Anchor**:
A content item pinned to a latitude, longitude, and optional altitude, with scale and rotation. Anchors ship in `src/anchors.json`; users cannot create or edit them in the app.
_Avoid_: Marker, POI, entity

**Destination**:
The first anchor in `src/anchors.json`. The walking route ends here; it follows JSON edits automatically.
_Avoid_: Target, goal, endpoint

**Route**:
The walking path from the live GPS position to the Destination, rendered as waypoint markers in AR and as a polyline on the map.
_Avoid_: Path, directions, track
