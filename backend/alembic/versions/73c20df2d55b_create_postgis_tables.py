"""create_postgis_tables

Revision ID: 73c20df2d55b
Revises: d09126a812df
Create Date: 2026-11-15 00:46:15.792228

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2

# revision identifiers, used by Alembic.
revision: str = '73c20df2d55b'
down_revision: Union[str, Sequence[str], None] = 'd09126a812df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema idempotently checking table and column existence."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    # Ensure PostGIS extension is available
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    except Exception:
        pass

    # 1. cross_system_records
    if 'cross_system_records' not in existing_tables:
        op.create_table(
            'cross_system_records',
            sa.Column('phenomenon_id', sa.String(length=64), nullable=False),
            sa.Column('date_str', sa.String(length=10), nullable=False),
            sa.Column('ocean_metric_val', sa.Float(), nullable=False),
            sa.Column('atmosphere_metric_val', sa.Float(), nullable=False),
            sa.Column('land_metric_val', sa.Float(), nullable=False),
            sa.Column('phase_label', sa.String(length=64), nullable=True),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_cross_system_lookup', 'cross_system_records', ['phenomenon_id', 'date_str'], unique=False)
        op.create_index(op.f('ix_cross_system_records_date_str'), 'cross_system_records', ['date_str'], unique=False)
        op.create_index(op.f('ix_cross_system_records_id'), 'cross_system_records', ['id'], unique=False)
        op.create_index(op.f('ix_cross_system_records_phenomenon_id'), 'cross_system_records', ['phenomenon_id'], unique=False)

    # 2. dataset_catalogs
    if 'dataset_catalogs' not in existing_tables:
        op.create_table(
            'dataset_catalogs',
            sa.Column('dataset_id', sa.String(length=64), nullable=False),
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
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_dataset_catalogs_dataset_id'), 'dataset_catalogs', ['dataset_id'], unique=True)
        op.create_index(op.f('ix_dataset_catalogs_id'), 'dataset_catalogs', ['id'], unique=False)
        op.create_index(op.f('ix_dataset_catalogs_module'), 'dataset_catalogs', ['module'], unique=False)

    # 3. earth_observations
    if 'earth_observations' not in existing_tables:
        op.create_table(
            'earth_observations',
            sa.Column('dataset_id', sa.String(), nullable=False),
            sa.Column('mission_name', sa.String(), nullable=False),
            sa.Column('observation_time', sa.DateTime(timezone=True), nullable=False),
            sa.Column('min_latitude', sa.Float(), nullable=False),
            sa.Column('max_latitude', sa.Float(), nullable=False),
            sa.Column('min_longitude', sa.Float(), nullable=False),
            sa.Column('max_longitude', sa.Float(), nullable=False),
            sa.Column('spatial_bounds', geoalchemy2.types.Geometry(geometry_type='POLYGON', srid=4326, dimension=2, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
            sa.Column('mean_value', sa.Float(), nullable=True),
            sa.Column('min_value', sa.Float(), nullable=True),
            sa.Column('max_value', sa.Float(), nullable=True),
            sa.Column('unit', sa.String(), nullable=False),
            sa.Column('extra_metadata', sa.JSON(), nullable=True),
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_earth_observations_dataset_id'), 'earth_observations', ['dataset_id'], unique=False)
        op.create_index(op.f('ix_earth_observations_id'), 'earth_observations', ['id'], unique=False)
        op.create_index(op.f('ix_earth_observations_mission_name'), 'earth_observations', ['mission_name'], unique=False)
        op.create_index(op.f('ix_earth_observations_observation_time'), 'earth_observations', ['observation_time'], unique=False)
    else:
        # Check if spatial_bounds column exists
        columns = [c['name'] for c in insp.get_columns('earth_observations')]
        if 'spatial_bounds' not in columns:
            op.add_column(
                'earth_observations',
                sa.Column('spatial_bounds', geoalchemy2.types.Geometry(geometry_type='POLYGON', srid=4326, dimension=2, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True)
            )

    # 4. observation_timeseries
    if 'observation_timeseries' not in existing_tables:
        op.create_table(
            'observation_timeseries',
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
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_ts_lookup', 'observation_timeseries', ['dataset_id', 'date_str', 'latitude', 'longitude'], unique=False)
        op.create_index(op.f('ix_observation_timeseries_dataset_id'), 'observation_timeseries', ['dataset_id'], unique=False)
        op.create_index(op.f('ix_observation_timeseries_date_str'), 'observation_timeseries', ['date_str'], unique=False)
        op.create_index(op.f('ix_observation_timeseries_id'), 'observation_timeseries', ['id'], unique=False)
        op.create_index(op.f('ix_observation_timeseries_location_name'), 'observation_timeseries', ['location_name'], unique=False)
        op.create_index(op.f('ix_observation_timeseries_metric_name'), 'observation_timeseries', ['metric_name'], unique=False)

    # GiST Index on spatial_bounds
    try:
        insp_post = sa.inspect(bind)
        cols = [c['name'] for c in insp_post.get_columns('earth_observations')]
        if 'spatial_bounds' in cols:
            indexes = [idx['name'] for idx in insp_post.get_indexes('earth_observations')]
            if 'idx_earth_observations_spatial_bounds' not in indexes:
                op.create_index(
                    'idx_earth_observations_spatial_bounds',
                    'earth_observations',
                    ['spatial_bounds'],
                    postgresql_using='gist'
                )
    except Exception:
        pass


def downgrade() -> None:
    """Downgrade schema safely."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'earth_observations' in existing_tables:
        indexes = [idx['name'] for idx in insp.get_indexes('earth_observations')]
        if 'idx_earth_observations_spatial_bounds' in indexes:
            op.drop_index('idx_earth_observations_spatial_bounds', table_name='earth_observations', postgresql_using='gist')
        columns = [c['name'] for c in insp.get_columns('earth_observations')]
        if 'spatial_bounds' in columns:
            op.drop_column('earth_observations', 'spatial_bounds')
