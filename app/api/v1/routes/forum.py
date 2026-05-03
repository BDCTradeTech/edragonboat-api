from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.forum import ForumCategory, ForumComment, ForumPost
from app.models.membership import TeamMembership
from app.models.team import Team
from app.models.user import User
from app.schemas.forum import (
    ForumCommentCreate,
    ForumCommentRead,
    ForumPostCreate,
    ForumPostRead,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _author_name(user: User | None) -> str:
    if user is None:
        return "Usuario eliminado"
    return (user.full_name or "").strip() or user.email


def _post_to_read(post: ForumPost, db: Session) -> ForumPostRead:
    author = db.get(User, post.author_id)
    team = db.get(Team, post.team_id) if post.team_id is not None else None
    comment_count: int = db.scalar(
        select(func.count(ForumComment.id)).where(ForumComment.post_id == post.id)
    ) or 0
    return ForumPostRead(
        id=post.id,
        title=post.title,
        content=post.content,
        category=post.category,
        author_id=post.author_id,
        author_name=_author_name(author),
        team_id=post.team_id,
        team_name=team.name if team else None,
        is_pinned=post.is_pinned,
        view_count=post.view_count,
        comment_count=comment_count,
        created_at=post.created_at,
        updated_at=post.updated_at,
    )


def _comment_to_read(comment: ForumComment, db: Session) -> ForumCommentRead:
    author = db.get(User, comment.author_id)
    # Resolver el equipo del comentario a partir del equipo del autor
    membership = db.scalar(
        select(TeamMembership).where(TeamMembership.user_id == comment.author_id).limit(1)
    )
    team = db.get(Team, membership.team_id) if membership is not None else None
    return ForumCommentRead(
        id=comment.id,
        post_id=comment.post_id,
        content=comment.content,
        author_id=comment.author_id,
        author_name=_author_name(author),
        team_id=team.id if team else None,
        team_name=team.name if team else None,
        created_at=comment.created_at,
    )


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


@router.get("/posts", response_model=list[ForumPostRead])
def list_posts(
    db: Annotated[Session, Depends(get_db)],
    category: ForumCategory | None = None,
    limit: int = 50,
) -> list[ForumPostRead]:
    """Lista paginada de posts, opcionalmente filtrada por categoría. No requiere auth."""
    stmt = select(ForumPost).order_by(ForumPost.is_pinned.desc(), ForumPost.created_at.desc())
    if category is not None:
        stmt = stmt.where(ForumPost.category == category)
    stmt = stmt.limit(limit)
    posts = db.scalars(stmt).all()
    return [_post_to_read(p, db) for p in posts]


@router.post("/posts", response_model=ForumPostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    body: ForumPostCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ForumPostRead:
    """Crea un post. team_id se asigna automáticamente al primer equipo del autor."""
    membership = db.scalar(
        select(TeamMembership).where(TeamMembership.user_id == current.id).limit(1)
    )
    team_id: int | None = membership.team_id if membership is not None else None

    post = ForumPost(
        title=body.title,
        content=body.content,
        category=body.category,
        author_id=current.id,
        team_id=team_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_to_read(post, db)


@router.get("/posts/{post_id}", response_model=ForumPostRead)
def get_post(
    post_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> ForumPostRead:
    """Detalle del post e incremento de view_count. No requiere auth."""
    post = db.get(ForumPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post no encontrado")
    post.view_count += 1
    db.commit()
    db.refresh(post)
    return _post_to_read(post, db)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Elimina un post. Solo el autor o un platform_admin pueden hacerlo."""
    post = db.get(ForumPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post no encontrado")
    if post.author_id != current.id and not current.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    db.delete(post)
    db.commit()


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


@router.get("/posts/{post_id}/comments", response_model=list[ForumCommentRead])
def list_comments(
    post_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> list[ForumCommentRead]:
    """Lista comentarios de un post ordenados por fecha ascendente. No requiere auth."""
    post = db.get(ForumPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post no encontrado")
    comments = db.scalars(
        select(ForumComment)
        .where(ForumComment.post_id == post_id)
        .order_by(ForumComment.created_at.asc())
    ).all()
    return [_comment_to_read(c, db) for c in comments]


@router.post(
    "/posts/{post_id}/comments",
    response_model=ForumCommentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    post_id: int,
    body: ForumCommentCreate,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ForumCommentRead:
    """Agrega un comentario a un post. Requiere auth."""
    post = db.get(ForumPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post no encontrado")
    comment = ForumComment(
        post_id=post_id,
        author_id=current.id,
        content=body.content,
    )
    db.add(comment)
    # Actualizar updated_at del post explícitamente (SQLite no dispara onupdate)
    post.updated_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(comment)
    return _comment_to_read(comment, db)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> None:
    """Elimina un comentario. Solo el autor o un platform_admin pueden hacerlo."""
    comment = db.get(ForumComment, comment_id)
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado"
        )
    if comment.author_id != current.id and not current.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permiso")
    db.delete(comment)
    db.commit()


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------


@router.patch("/posts/{post_id}/pin", response_model=ForumPostRead)
def pin_post(
    post_id: int,
    body: dict,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> ForumPostRead:
    """Fijar/desfijar un post. Solo platform_admin."""
    if not current.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo platform_admin")
    post = db.get(ForumPost, post_id)
    if post is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post no encontrado")
    pinned = body.get("pinned")
    if not isinstance(pinned, bool):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El campo 'pinned' debe ser booleano",
        )
    post.is_pinned = pinned
    post.updated_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(post)
    return _post_to_read(post, db)
