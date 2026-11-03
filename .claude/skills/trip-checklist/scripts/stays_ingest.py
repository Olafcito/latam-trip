"""Closed, like tripdb add-stays. The old stays table takes no new rows.

A stay price is written only for a room of a lodging that exists, with the connector's add_lodging_price.
"""
import sys

print("The stays table is closed. Add prices for places that exist with the connector's add_lodging_price.")
sys.exit(1)
