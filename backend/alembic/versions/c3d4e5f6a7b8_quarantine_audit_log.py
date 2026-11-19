"""quarantine_audit_log

Revision ID: c3d4e5f6a7b8
Revises: f2b3c4d5e6f7
Create Date: 2026-11-19 14:00:00.000000

"""
from typing import Sequence, Union
import json
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'f2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    # 1. Ensure PostGIS point geometry column exists on observation_timeseries
    if 'observation_timeseries' in existing_tables:
        columns = [c['name'] for c in insp.get_columns('observation_timeseries')]
        if 'geom' not in columns:
            op.add_column(
                'observation_timeseries',
                sa.Column(
                    'geom',
                    geoalchemy2.types.Geometry(
                        geometry_type='POINT',
                        srid=4326,
                        dimension=2,
                        from_text='ST_GeomFromEWKT',
                        name='geometry',
                    ),
                    nullable=True,
                )
            )

        # Create GiST spatial index if PostgreSQL
        try:
            if bind.dialect.name == "postgresql":
                insp_post = sa.inspect(bind)
                indexes = [idx['name'] for idx in insp_post.get_indexes('observation_timeseries')]
                if 'idx_observation_timeseries_geom' not in indexes:
                    op.create_index(
                        'idx_observation_timeseries_geom',
                        'observation_timeseries',
                        ['geom'],
                        postgresql_using='gist',
                    )
        except Exception:
            pass

    # 2. Create quarantine_audit_log table if not exists
    if 'quarantine_audit_log' not in existing_tables:
        op.create_table(
            'quarantine_audit_log',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('record_id', sa.String(length=64), nullable=False),
            sa.Column('table_name', sa.String(length=64), nullable=False),
            sa.Column('quarantine_reason', sa.Text(), nullable=False),
            sa.Column('quarantined_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('provenance_details', sa.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_quarantine_audit_log_record_id', 'quarantine_audit_log', ['record_id'], unique=False)
        op.create_index('ix_quarantine_audit_log_table_name', 'quarantine_audit_log', ['table_name'], unique=False)
        op.create_index('ix_quarantine_audit_log_quarantined_at', 'quarantine_audit_log', ['quarantined_at'], unique=False)

    # 3. Populate audit log records and update legacy unverified records to quarantined_synthetic
    now_utc = datetime.now(timezone.utc)
    quarantine_reason = "Legacy record missing verified NASA Earthdata source checksum or marked unverified/synthetic"

    if 'observation_timeseries' in existing_tables:
        try:
            ts_rows = bind.execute(
                sa.text(
                    "SELECT id, dataset_id, granule_id, source_file_checksum, verification_status "
                    "FROM observation_timeseries "
                    "WHERE verification_status != 'verified_observation' OR source_file_checksum IS NULL"
                )
            ).fetchall()
            for row in ts_rows:
                details = {
                    "dataset_id": row[1],
                    "granule_id": row[2],
                    "source_file_checksum": row[3],
                    "previous_status": row[4],
                }
                bind.execute(
                    sa.text(
                        "INSERT INTO quarantine_audit_log (record_id, table_name, quarantine_reason, quarantined_at, provenance_details) "
                        "VALUES (:rec_id, 'observation_timeseries', :reason, :q_at, :details)"
                    ),
                    {
                        "rec_id": str(row[0]),
                        "reason": quarantine_reason,
                        "q_at": now_utc,
                        "details": json.dumps(details),
                    },
                )
            bind.execute(
                sa.text(
                    "UPDATE observation_timeseries "
                    "SET verification_status = 'quarantined_synthetic' "
                    "WHERE verification_status != 'verified_observation' OR source_file_checksum IS NULL"
                )
            )
        except Exception:
            pass

    if 'earth_observations' in existing_tables:
        try:
            obs_rows = bind.execute(
                sa.text(
                    "SELECT id, dataset_id, source_file_checksum, verification_status "
                    "FROM earth_observations "
                    "WHERE verification_status != 'verified_observation' OR source_file_checksum IS NULL"
                )
            ).fetchall()
            for row in obs_rows:
                details = {
                    "dataset_id": row[1],
                    "source_file_checksum": row[2],
                    "previous_status": row[3],
                }
                bind.execute(
                    sa.text(
                        "INSERT INTO quarantine_audit_log (record_id, table_name, quarantine_reason, quarantined_at, provenance_details) "
                        "VALUES (:rec_id, 'earth_observations', :reason, :q_at, :details)"
                    ),
                    {
                        "rec_id": str(row[0]),
                        "reason": quarantine_reason,
                        "q_at": now_utc,
                        "details": json.dumps(details),
                    },
                )
            bind.execute(
                sa.text(
                    "UPDATE earth_observations "
                    "SET verification_status = 'quarantined_synthetic' "
                    "WHERE verification_status != 'verified_observation' OR source_file_checksum IS NULL"
                )
            )
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = set(insp.get_table_names())

    if 'quarantine_audit_log' in existing_tables:
        try:
            op.drop_index('ix_quarantine_audit_log_quarantined_at', table_name='quarantine_audit_log')
            op.drop_index('ix_quarantine_audit_log_table_name', table_name='quarantine_audit_log')
            op.drop_index('ix_quarantine_audit_log_record_id', table_name='quarantine_audit_log')
            op.drop_table('quarantine_audit_log')
        except Exception:
            pass

    if 'observation_timeseries' in existing_tables:
        columns = [c['name'] for c in insp.get_columns('observation_timeseries')]
        if 'geom' in columns:
            try:
                if bind.dialect.name == "postgresql":
                    op.drop_index('idx_observation_timeseries_geom', table_name='observation_timeseries', postgresql_using='gist')
            except Exception:
                pass
            try:
                op.drop_column('observation_timeseries', 'geom')
            except Exception:
                pass
