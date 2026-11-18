"""quarantine_synthetic_records

Revision ID: e1a2b3c4d5e6
Revises: 73c20df2d55b
Create Date: 2026-11-18 22:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = '73c20df2d55b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add verification and provenance columns to earth_observations
    op.add_column(
        'earth_observations',
        sa.Column('verification_status', sa.String(length=32), server_default='unverified', nullable=False)
    )
    op.add_column(
        'earth_observations',
        sa.Column('source_file_checksum', sa.String(length=64), nullable=True)
    )
    op.add_column(
        'earth_observations',
        sa.Column('granule_id', sa.String(length=128), nullable=True)
    )
    op.add_column(
        'earth_observations',
        sa.Column('processing_version', sa.String(length=32), nullable=True)
    )
    op.create_index(
        'ix_earth_observations_verification_status',
        'earth_observations',
        ['verification_status']
    )
    op.create_index(
        'ix_earth_observations_granule_id',
        'earth_observations',
        ['granule_id']
    )

    # 2. Add verification and provenance columns to observation_timeseries
    op.add_column(
        'observation_timeseries',
        sa.Column('verification_status', sa.String(length=32), server_default='unverified', nullable=False)
    )
    op.add_column(
        'observation_timeseries',
        sa.Column('source_file_checksum', sa.String(length=64), nullable=True)
    )
    op.add_column(
        'observation_timeseries',
        sa.Column('granule_id', sa.String(length=128), nullable=True)
    )
    op.create_index(
        'ix_observation_timeseries_verification_status',
        'observation_timeseries',
        ['verification_status']
    )
    op.create_index(
        'ix_observation_timeseries_granule_id',
        'observation_timeseries',
        ['granule_id']
    )

    # 3. Scientific Data Quarantine:
    # Any pre-existing records lacking verifiable source file checksums are flagged as synthetic
    try:
        op.execute(
            "UPDATE earth_observations "
            "SET verification_status = 'synthetic' "
            "WHERE source_file_checksum IS NULL OR verification_status = 'unverified'"
        )
        op.execute(
            "UPDATE observation_timeseries "
            "SET verification_status = 'synthetic' "
            "WHERE source_file_checksum IS NULL OR verification_status = 'unverified'"
        )
    except Exception:
        pass


def downgrade() -> None:
    op.drop_index('ix_observation_timeseries_granule_id', table_name='observation_timeseries')
    op.drop_index('ix_observation_timeseries_verification_status', table_name='observation_timeseries')
    op.drop_column('observation_timeseries', 'granule_id')
    op.drop_column('observation_timeseries', 'source_file_checksum')
    op.drop_column('observation_timeseries', 'verification_status')

    op.drop_index('ix_earth_observations_granule_id', table_name='earth_observations')
    op.drop_index('ix_earth_observations_verification_status', table_name='earth_observations')
    op.drop_column('earth_observations', 'processing_version')
    op.drop_column('earth_observations', 'granule_id')
    op.drop_column('earth_observations', 'source_file_checksum')
    op.drop_column('earth_observations', 'verification_status')
