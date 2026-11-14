"""create_initial_scientific_tables

Revision ID: d09126a812df
Revises: 
Create Date: 2026-11-14 17:56:53.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd09126a812df'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New Render Postgres databases support PostGIS but do not enable it by default.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # 1. Dataset Catalogs
    op.create_table(
        'dataset_catalogs',
        sa.Column('dataset_id', sa.String(length=64), primary_key=True, nullable=False),
        sa.Column('module', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('agency', sa.String(length=128), nullable=False),
        sa.Column('sensor', sa.String(length=255), nullable=False),
        sa.Column('spatial_resolution', sa.String(length=128), nullable=False),
        sa.Column('temporal_resolution', sa.String(length=64), nullable=False),
        sa.Column('units', sa.JSON(), nullable=True),
        sa.Column('variables', sa.JSON(), nullable=True),
        sa.Column('scientific_purpose', sa.Text(), nullable=False),
        sa.Column('scientific_limitations', sa.JSON(), nullable=True),
        sa.Column('cmr_concept_id', sa.String(length=64), nullable=True),
        sa.Column('documentation_url', sa.String(length=512), nullable=True),
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_dataset_catalogs_module', 'dataset_catalogs', ['module'])

    # 2. Earth Observations (Bounding Boxes & Granules)
    op.create_table(
        'earth_observations',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('dataset_id', sa.String(length=64), nullable=False),
        sa.Column('mission_name', sa.String(length=128), nullable=False),
        sa.Column('observation_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('min_latitude', sa.Float(), nullable=False),
        sa.Column('max_latitude', sa.Float(), nullable=False),
        sa.Column('min_longitude', sa.Float(), nullable=False),
        sa.Column('max_longitude', sa.Float(), nullable=False),
        sa.Column('mean_value', sa.Float(), nullable=True),
        sa.Column('min_value', sa.Float(), nullable=True),
        sa.Column('max_value', sa.Float(), nullable=True),
        sa.Column('unit', sa.String(length=32), nullable=False),
        sa.Column('extra_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_earth_observations_dataset_id', 'earth_observations', ['dataset_id'])
    op.create_index('ix_earth_observations_time', 'earth_observations', ['observation_time'])

    # 3. Time-Series Records
    op.create_table(
        'observation_timeseries',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('dataset_id', sa.String(length=64), nullable=False),
        sa.Column('location_name', sa.String(length=128), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('date_str', sa.String(length=10), nullable=False),
        sa.Column('metric_name', sa.String(length=64), nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(length=32), nullable=False),
        sa.Column('baseline_normal', sa.Float(), nullable=True),
        sa.Column('anomaly', sa.Float(), nullable=True),
        sa.Column('quality_flag', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_ts_lookup', 'observation_timeseries', ['dataset_id', 'date_str', 'latitude', 'longitude'])

    # 4. Cross-System Teleconnections
    op.create_table(
        'cross_system_records',
        sa.Column('id', sa.String(length=36), primary_key=True, nullable=False),
        sa.Column('phenomenon_id', sa.String(length=64), nullable=False),
        sa.Column('date_str', sa.String(length=10), nullable=False),
        sa.Column('ocean_metric_val', sa.Float(), nullable=False),
        sa.Column('atmosphere_metric_val', sa.Float(), nullable=False),
        sa.Column('land_metric_val', sa.Float(), nullable=False),
        sa.Column('phase_label', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('idx_cross_system_lookup', 'cross_system_records', ['phenomenon_id', 'date_str'])


def downgrade() -> None:
    op.drop_table('cross_system_records')
    op.drop_table('observation_timeseries')
    op.drop_table('earth_observations')
    op.drop_table('dataset_catalogs')
