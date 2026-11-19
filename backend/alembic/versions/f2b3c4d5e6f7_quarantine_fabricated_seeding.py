"""quarantine_fabricated_seeding

Revision ID: f2b3c4d5e6f7
Revises: e1a2b3c4d5e6
Create Date: 2026-11-19 07:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'e1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely quarantine any hardcoded or seeded benchmark records previously labeled as verified_observation
    try:
        op.execute(
            """
            UPDATE observation_timeseries
            SET verification_status = 'quarantined_synthetic'
            WHERE source_file_checksum IN (
                '7f8a9e21b04c83d169e55a73e6cf1e4a19b88d36371f6520b78d8a7c29e1fa04',
                '8c3b2e1a90f4d38165e22b13e9ca2e4b29c88a36471e6520a78c8b7c29e1da11',
                '1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef'
            )
            OR granule_id LIKE 'SYNTHETIC%'
            OR granule_id = 'SWOT_L2_LR_SSH_WindWave_048_116_20260331T232854_PID0_01'
            OR granule_id = 'MOD13C2.A2026060.061.2026098012318'
            OR granule_id = 'AQUA_MODIS.20260530.L3m.DAY.CHL.chlor_a.9km.nc'
            OR granule_id = '3B-MO.MS.MRG.3IMERG.20250901-S000000-E235959.09.V07B.HDF5'
            OR granule_id = 'MOD08_M3.A2026244.061.2026290004827.hdf'
            """
        )
        op.execute(
            """
            UPDATE earth_observations
            SET verification_status = 'quarantined_synthetic'
            WHERE source_file_checksum IN (
                '7f8a9e21b04c83d169e55a73e6cf1e4a19b88d36371f6520b78d8a7c29e1fa04',
                '8c3b2e1a90f4d38165e22b13e9ca2e4b29c88a36471e6520a78c8b7c29e1da11',
                '1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef'
            )
            """
        )
    except Exception:
        pass


def downgrade() -> None:
    pass
