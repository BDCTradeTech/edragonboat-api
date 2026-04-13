import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TeamRole(str, enum.Enum):
    captain = "captain"
    coach = "coach"
    paddler = "paddler"


class TeamMembership(Base):
    __tablename__ = "team_memberships"
    __table_args__ = (UniqueConstraint("user_id", "team_id", name="uq_user_team"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[TeamRole] = mapped_column(
        Enum(TeamRole, native_enum=False, length=20),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="memberships")
    team: Mapped["Team"] = relationship("Team", back_populates="memberships")
