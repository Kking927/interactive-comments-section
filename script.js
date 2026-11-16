// ==========================================
// Firebase Initialization & Config
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    "YOUR_FIREBASE_API_KEY", // Keep public keys safe or restrict them in Google Cloud Console
    authDomain: "interactive-comments-demo.firebaseapp.com",
    projectId: "interactive-comments-demo",
    storageBucket: "interactive-comments-demo.firebasestorage.app",
    messagingSenderId: "329934664917",
    appId: "1:329934664917:web:0f5c69534f2b6d9d239e5c",
    measurementId: "G-S4HNQK9TRZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const commentsCol = collection(db, 'comments');
const votesCol = collection(db, 'votes');

// ==========================================
// Global State
// ==========================================
let commentData = {
    currentUser: {
        username: "juliusomo",
        image: {
            png: "images/image-juliusomo.png"
        }
    },
    comments: []
};

// ==========================================
// DOM Elements
// ==========================================
const commentsListEl = document.getElementById('comments-list');
const commentFormEl = document.getElementById('comment-form');
const commentInputEl = document.getElementById('comment-input');
const currentUserAvatarEl = document.getElementById('current-user-avatar');
const deleteModalEl = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

let commentToDeleteId = null;
let comment4ManuallyDeleted = false;

// ==========================================
// Utility Functions
// ==========================================
function makeSlashesWrappable(text) {
    if (!text) return '';
    return text.replace(/\//g, '/\u200B');
}

function nestComments(flatComments) {
    const map = {};
    const roots = [];

    // 1. Map each comment by its string ID
    flatComments.forEach(comment => {
        map[String(comment.id)] = { ...comment, replies: [] };
    });

    function findRoot(item) {
        let current = item;
        let depth = 0;
        while (depth < 5) {
            depth++;
            if (!current.parent_id && !current.replying_to) {
                return current;
            }
            if (current.parent_id && map[String(current.parent_id)]) {
                current = map[String(current.parent_id)];
            } else if (current.replying_to) {
                const parent = Object.values(map).find(
                    c => c.username === current.replying_to && String(c.id) !== String(current.id)
                );
                if (parent) {
                    current = parent;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        return current;
    }

    // 2. Assign replies to their ultimate root parent
    flatComments.forEach(comment => {
        const item = map[String(comment.id)];
        if (!comment.parent_id && !comment.replying_to) {
            roots.push(item);
        } else {
            const root = findRoot(item);
            if (root && String(root.id) !== String(item.id)) {
                root.replies.push(item);
            } else {
                roots.push(item);
            }
        }
    });

    // 3. Sort chronologically (handles both seed order and ISO timestamps)
    const sortByTime = (a, b) => {
        const timeA = a.sort_order || Date.parse(a.created_at) || 0;
        const timeB = b.sort_order || Date.parse(b.created_at) || 0;
        return timeA - timeB;
    };

    roots.sort(sortByTime);
    roots.forEach(root => {
        if (root.replies && root.replies.length > 0) {
            root.replies.sort(sortByTime);
        }
    });

    return roots;
}

function getRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    if (isNaN(Date.parse(dateString))) return dateString;

    const now = new Date();
    const past = new Date(dateString);
    const elapsedSeconds = Math.floor((now - past) / 1000);

    const minutes = Math.floor(elapsedSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} ${years === 1 ? 'year' : 'years'} ago`;
    if (months > 0) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    if (weeks > 0) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    return 'Just now';
}

function findCommentById(comments, id) {
    for (const comment of comments) {
        if (String(comment.id) === String(id)) return comment;
        if (comment.replies && comment.replies.length > 0) {
            const found = findCommentById(comment.replies, id);
            if (found) return found;
        }
    }
    return null;
}

// ==========================================
// Seed Database from data.json if Empty
// ==========================================
async function seedDatabaseFromJson() {
    try {
        const res = await fetch('./data.json');
        const json = await res.json();
        const flatRows = [];

        json.comments.forEach((c) => {
            flatRows.push({
                id: String(c.id),
                content: c.content,
                score: c.score,
                username: c.user.username,
                user_image: c.user.image.png,
                replying_to: null,
                parent_id: null,
                created_at: c.createdAt,
                sort_order: c.id // Preserves 1, 2, 3, 4 starter order
            });

            if (c.replies && c.replies.length > 0) {
                c.replies.forEach((r) => {
                    flatRows.push({
                        id: String(r.id),
                        content: r.content,
                        score: r.score,
                        username: r.user.username,
                        user_image: r.user.image.png,
                        replying_to: r.replyingTo,
                        parent_id: String(c.id),
                        created_at: r.createdAt,
                        sort_order: r.id
                    });
                });
            }
        });

        for (const row of flatRows) {
            const { id, ...dataWithoutId } = row;
            await setDoc(doc(db, 'comments', id), dataWithoutId);
        }

        return flatRows;
    } catch (err) {
        console.error('Error seeding Firestore from data.json:', err);
        return [];
    }
}

// ==========================================
// Initialize, Fetch & Self-Heal Comments
// ==========================================
async function initComments() {
    // 1. Set the avatar immediately
    if (currentUserAvatarEl && commentData.currentUser.image) {
        currentUserAvatarEl.src = commentData.currentUser.image.png;
        currentUserAvatarEl.alt = `${commentData.currentUser.username}'s avatar`;
    }

    // 2. INSTANT LOAD from localStorage
    const cachedComments = localStorage.getItem('cached_comments');
    if (cachedComments) {
        try {
            commentData.comments = JSON.parse(cachedComments);
            renderComments();
        } catch (e) {
            console.error("Error parsing cache:", e);
        }
    }

    // 3. BACKGROUND FETCH from Firestore
    try {
        let snapshot = await getDocs(commentsCol);
        let commentsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // If database is completely empty, seed it using data.json
        if (commentsData.length === 0) {
            commentsData = await seedDatabaseFromJson();
        }

        // --- AUTOMATIC RESTORATION FOR DEMO COMMENT (ID "4") ---
        const targetSeedId = "4";
        const exists = commentsData.some(c => String(c.id) === targetSeedId);

        if (!exists && !comment4ManuallyDeleted) {
            const payload = {
                content: "I couldn't agree more with this. Everything moves so fast and it always seems like everyone knows the newest library/framework. But the fundamentals are what stay constant.",
                score: 2,
                username: "juliusomo",
                user_image: "images/image-juliusomo.png",
                replying_to: "ramsesmiron",
                parent_id: "2",
                created_at: new Date().toISOString(),
                sort_order: 4
            };

            await setDoc(doc(db, 'comments', targetSeedId), payload);
            snapshot = await getDocs(commentsCol);
            commentsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        // Fetch current user's votes from Firestore
        const votesQuery = query(votesCol, where('username', '==', commentData.currentUser.username));
        const votesSnapshot = await getDocs(votesQuery);

        const userVotesMap = {};
        votesSnapshot.forEach(vDoc => {
            const v = vDoc.data();
            userVotesMap[String(v.comment_id)] = v.vote_type;
        });

        const flatCommentsWithVotes = commentsData.map(comment => ({
            ...comment,
            userVote: userVotesMap[String(comment.id)] || 0
        }));

        const nestedTree = nestComments(flatCommentsWithVotes);

        commentData.comments = nestedTree;
        localStorage.setItem('cached_comments', JSON.stringify(nestedTree));

        renderComments();
    } catch (error) {
        console.error('Error loading comments from Firestore:', error);
    }
}

// ==========================================
// Render Comments
// ==========================================
function renderComments() {
    if (!commentsListEl) return;
    commentsListEl.innerHTML = '';

    if (commentData.comments.length === 0) return;

    commentData.comments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsListEl.appendChild(commentElement);
    });
}

function createCommentElement(comment) {
    const li = document.createElement('li');
    li.classList.add('comments__item');
    li.dataset.id = comment.id;

    const isCurrentUser = comment.username === commentData.currentUser.username;
    const formattedDate = getRelativeTime(comment.createdAt || comment.created_at);
    const upvoteActiveClass = comment.userVote === 1 ? 'active' : '';
    const downvoteActiveClass = comment.userVote === -1 ? 'active' : '';

    li.innerHTML = `
    <article class="comment">
        <div class="comment__score">
            <button type="button" class="comment__score-btn comment__score-btn--plus ${upvoteActiveClass}" aria-label="Upvote">
                <svg width="11" height="11" xmlns="http://www.w3.org/2000/svg"><path d="M6.33 10.896c.137 0 .255-.05.354-.149.1-.1.149-.217.149-.354V7.004h3.315c.136 0 .254-.05.354-.149.099-.1.148-.217.148-.354V5.272a.483.483 0 0 0-.148-.354.483.483 0 0 0-.354-.149H6.833V1.4a.483.483 0 0 0-.149-.354.483.483 0 0 0-.354-.149H4.915a.483.483 0 0 0-.354.149c-.1.1-.149.217-.149.354v3.37H1.08a.483.483 0 0 0-.354.15c-.1.099-.149.217-.149.353v1.23c0 .136.05.254.149.353.1.1.217.149.354.149h3.333v3.39c0 .136.05.254.15.353.098.1.216.149.353.149H6.33Z" fill="currentColor"/></svg>
            </button>
            <span class="comment__score-number">${comment.score}</span>
            <button type="button" class="comment__score-btn comment__score-btn--minus ${downvoteActiveClass}" aria-label="Downvote">
                <svg width="11" height="3" xmlns="http://www.w3.org/2000/svg"><path d="M9.256 2.66c.204 0 .38-.056.53-.167.148-.11.222-.243.222-.396V.722c0-.152-.074-.284-.223-.395a.859.859 0 0 0-.53-.167H.76a.859.859 0 0 0-.53.167C.083.437.009.57.009.722v1.375c0 .153.074.285.223.396a.859.859 0 0 0 .53.167h8.495Z" fill="currentColor"/></svg>
            </button>
        </div>

        <div class="comment__content">
            <header class="comment__header">
                <div class="comment__user">
                    <img src="${comment.user_image}" alt="${comment.username}" />
                    <div class="comment__user-details">
                        <span class="comment__username">${comment.username}</span>
                        ${isCurrentUser ? '<span class="comment__badge comment__badge--you">you</span>' : ''}
                    </div>
                    <span class="comment__date">${formattedDate}</span>
                </div>

                <div class="comment__actions">
                    ${isCurrentUser
                        ? `<button type="button" class="comment__action comment__action--delete">
                                <img src="images/icon-delete.svg" alt="" /> Delete
                           </button>
                           <button type="button" class="comment__action comment__action--edit">
                                <img src="images/icon-edit.svg" alt="" /> Edit
                           </button>`
                        : `<button type="button" class="comment__action comment__action--reply">
                                <img src="images/icon-reply.svg" alt="" /> Reply
                           </button>`
                    }
                </div>
            </header>

            <p class="comment__text">
                ${comment.replying_to ? `<span class="comment__replying-to">@${comment.replying_to}</span> ` : ''}
                ${makeSlashesWrappable(comment.content)}
            </p>
        </div>
    </article>

    <div class="comment__replies">
        <ul class="comments__list comments__list--nested"></ul>
    </div>
    `;

    if (comment.replies && comment.replies.length > 0) {
        const repliesListEl = li.querySelector('.comment__replies .comments__list');
        comment.replies.forEach(reply => {
            repliesListEl.appendChild(createCommentElement(reply));
        });
    }

    return li;
}

document.addEventListener('DOMContentLoaded', initComments);

// ==========================================
// Form Submission Logic (Insert)
// ==========================================
if (commentFormEl) {
    commentFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const content = commentInputEl.value.trim();
        if (!content) return;

        const newComment = {
            content: content,
            score: 0,
            username: commentData.currentUser.username,
            user_image: commentData.currentUser.image.png,
            replying_to: null,
            parent_id: null,
            created_at: new Date().toISOString(),
            sort_order: Date.now()
        };

        try {
            await addDoc(commentsCol, newComment);
            commentInputEl.value = '';
            await initComments();
        } catch (error) {
            console.error('Error posting comment to Firestore:', error);
            alert('Failed to post comment. Check console for details.');
        }
    });
}

// ==========================================
// Upvote / Downvote Logic (Persistent via votes collection)
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', async (e) => {
        const scoreBtn = e.target.closest('.comment__score-btn');
        if (!scoreBtn) return;

        const commentItem = scoreBtn.closest('.comments__item');
        if (!commentItem) return;

        const commentId = String(commentItem.dataset.id);
        const isUpvote = scoreBtn.classList.contains('comment__score-btn--plus');
        const scoreNumberEl = commentItem.querySelector('.comment__score-number');

        const commentObj = findCommentById(commentData.comments, commentId);
        if (!commentObj) return;

        let currentScore = commentObj.score;
        let currentVote = commentObj.userVote;
        let scoreChange = 0;
        let newVoteType = 0;

        if (isUpvote) {
            if (currentVote === 1) {
                scoreChange = -1;
                newVoteType = 0;
            } else if (currentVote === -1) {
                scoreChange = 2;
                newVoteType = 1;
            } else {
                scoreChange = 1;
                newVoteType = 1;
            }
        } else {
            if (currentVote === -1) {
                scoreChange = 1;
                newVoteType = 0;
            } else if (currentVote === 1) {
                scoreChange = -2;
                newVoteType = -1;
            } else {
                scoreChange = -1;
                newVoteType = -1;
            }
        }

        const newScore = currentScore + scoreChange;
        // Composite document ID prevents duplicate votes per user/comment
        const voteDocId = `${commentData.currentUser.username}_${commentId}`;
        const voteRef = doc(db, 'votes', voteDocId);
        const commentRef = doc(db, 'comments', commentId);

        try {
            if (newVoteType === 0) {
                await deleteDoc(voteRef);
            } else {
                await setDoc(voteRef, {
                    comment_id: commentId,
                    username: commentData.currentUser.username,
                    vote_type: newVoteType
                });
            }

            await updateDoc(commentRef, { score: newScore });

            localStorage.removeItem('cached_comments');

            commentObj.score = newScore;
            commentObj.userVote = newVoteType;
            scoreNumberEl.textContent = newScore;

            // Update active button styling immediately
            const plusBtn = commentItem.querySelector('.comment__score-btn--plus');
            const minusBtn = commentItem.querySelector('.comment__score-btn--minus');
            plusBtn.classList.toggle('active', newVoteType === 1);
            minusBtn.classList.toggle('active', newVoteType === -1);
        } catch (error) {
            console.error('Error updating vote in Firestore:', error);
            alert('Failed to update vote. Check console for details.');
        }
    });
}

// ==========================================
// Reply Form Toggle & Submission Logic
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const replyBtn = e.target.closest('.comment__action--reply');
        if (!replyBtn) return;

        const commentItem = replyBtn.closest('.comments__item');
        if (!commentItem) return;

        const existingReplyForm = document.querySelector('.reply-form-container');
        const isCurrentCommentForm = existingReplyForm && commentItem.contains(existingReplyForm);

        if (existingReplyForm) {
            existingReplyForm.remove();
        }

        if (isCurrentCommentForm) return;

        const usernameEl = commentItem.querySelector('.comment__username');
        const replyingToUser = usernameEl ? usernameEl.textContent : '';

        const replyFormDiv = document.createElement('div');
        replyFormDiv.classList.add('reply-form-container');

        replyFormDiv.innerHTML = `
            <form class="reply-form" id="reply-form">
                <img src="${commentData.currentUser.image.png}" alt="${commentData.currentUser.username}" class="reply-form__avatar" />
                <textarea class="reply-form__input" placeholder="Write a reply..." required>@${replyingToUser} </textarea>
                <button type="submit" class="reply-form__btn">Reply</button>
            </form>
        `;

        const commentArticle = commentItem.querySelector('.comment');
        commentArticle.after(replyFormDiv);

        const textarea = replyFormDiv.querySelector('textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const replyForm = replyFormDiv.querySelector('.reply-form');
        replyForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();

            const rawContent = textarea.value.trim();
            const content = rawContent.startsWith('@')
                ? rawContent.replace(/^@\S+\s*/, '')
                : rawContent;

            if (!content) return;

            const parentId = String(commentItem.dataset.id);

            const newReply = {
                content: content,
                score: 0,
                username: commentData.currentUser.username,
                user_image: commentData.currentUser.image.png,
                replying_to: replyingToUser,
                parent_id: parentId,
                created_at: new Date().toISOString(),
                sort_order: Date.now()
            };

            try {
                await addDoc(commentsCol, newReply);
                replyFormDiv.remove();
                await initComments();
            } catch (error) {
                console.error('Error posting reply to Firestore:', error);
                alert('Failed to post reply. Check console for details.');
            }
        });
    });
}

document.addEventListener('click', (event) => {
    const activeReplyForm = document.querySelector('.reply-form-container');
    if (activeReplyForm && !activeReplyForm.contains(event.target) && !event.target.closest('.comment__action--reply')) {
        activeReplyForm.remove();
    }
});

// ==========================================
// Delete Modal & Actions Logic
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.comment__action--delete');
        if (!deleteBtn) return;

        const commentItem = deleteBtn.closest('.comments__item');
        if (commentItem) {
            commentToDeleteId = String(commentItem.dataset.id);
            if (deleteModalEl && typeof deleteModalEl.showModal === 'function') {
                deleteModalEl.showModal();
            }
        }
    });
}

if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', () => {
        if (deleteModalEl && typeof deleteModalEl.close === 'function') {
            deleteModalEl.close();
        }
        commentToDeleteId = null;
    });
}

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
        if (!commentToDeleteId) return;

        if (String(commentToDeleteId) === "4") {
            comment4ManuallyDeleted = true;
        }

        try {
            await deleteDoc(doc(db, 'comments', String(commentToDeleteId)));

            if (deleteModalEl && typeof deleteModalEl.close === 'function') {
                deleteModalEl.close();
            }
            commentToDeleteId = null;
            await initComments();
        } catch (error) {
            console.error('Error deleting comment from Firestore:', error);
            alert('Failed to delete comment. Check console for details.');
        }
    });
}

// ==========================================
// Edit Comment Logic
// ==========================================
if (commentsListEl) {
    commentsListEl.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.comment__action--edit');
        if (!editBtn) return;

        const commentItem = editBtn.closest('.comments__item');
        if (!commentItem) return;

        const commentContentEl = commentItem.querySelector('.comment__content');
        const commentTextP = commentItem.querySelector('.comment__text');

        if (commentContentEl.querySelector('.edit-form-container')) return;

        const commentId = String(commentItem.dataset.id);
        const commentObj = findCommentById(commentData.comments, commentId);
        if (!commentObj) return;

        commentTextP.style.display = 'none';

        const editFormDiv = document.createElement('div');
        editFormDiv.classList.add('edit-form-container');
        editFormDiv.style.marginBlockStart = '0.5rem';

        editFormDiv.innerHTML = `
            <form class="edit-form">
                <textarea class="comment__form-input edit-form__input" style="width: 100%; min-height: 5rem; resize: none;" required>${commentObj.content}</textarea>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-block-start: 0.75rem;">
                    <button type="button" class="comment__form-button edit-form__btn--cancel" style="background-color: var(--grey-500);">Cancel</button>
                    <button type="submit" class="comment__form-button">Update</button>
                </div>
            </form>
        `;

        commentContentEl.appendChild(editFormDiv);

        const textarea = editFormDiv.querySelector('textarea');
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        const cancelBtn = editFormDiv.querySelector('.edit-form__btn--cancel');
        cancelBtn.addEventListener('click', () => {
            editFormDiv.remove();
            commentTextP.style.display = '';
        });

        const editForm = editFormDiv.querySelector('.edit-form');
        editForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const updatedContent = textarea.value.trim();
            if (!updatedContent) return;

            try {
                await updateDoc(doc(db, 'comments', commentId), { content: updatedContent });

                commentObj.content = updatedContent;

                const replyingToHtml = commentObj.replying_to ? `<span class="comment__replying-to">@${commentObj.replying_to}</span> ` : '';
                commentTextP.innerHTML = replyingToHtml + makeSlashesWrappable(updatedContent);

                localStorage.setItem('cached_comments', JSON.stringify(commentData.comments));

                editFormDiv.remove();
                commentTextP.style.display = '';
            } catch (error) {
                console.error('Error updating comment in Firestore:', error);
                alert('Failed to update comment. Check console for details.');
            }
        });
    });
}
