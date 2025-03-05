"""
Utility module for Pokémon-related constants and functions.
This module contains shared resources that can be used across multiple scripts.
"""

# Special character name mappings
SPECIAL_NAME_MAPPINGS = {
    "NidoranM": "NIDORAN_M",
    "NidoranF": "NIDORAN_F",
    "Farfetchd": "FARFETCHD",
    "MrMime": "MR_MIME",
    "Nidoran♂": "NIDORAN_M",
    "Nidoran♀": "NIDORAN_F",
    "Mr.Mime": "MR_MIME",
    "Farfetch'd": "FARFETCHD",
}


def normalize_pokemon_name(name):
    """Convert names with special characters to their constant representation."""
    if name in SPECIAL_NAME_MAPPINGS:
        return SPECIAL_NAME_MAPPINGS[name]
    return name.upper()
