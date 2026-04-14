import { prisma } from './index';

export async function seedArticleComments() {
  console.log('=== Seed: article comments (start) ===');

  const articles = await prisma.article.findMany({
    where: {
      isDeleted: false,
      status: 'PUBLISHED',
    },
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: { uid: true, title: true },
  });

  const members = await prisma.member.findMany({
    orderBy: { createdAt: 'asc' },
    take: 6,
    select: {
      uid: true,
      name: true,
    },
  });

  if (articles.length === 0) {
    console.log('⚠️ Skipping article comments seed: no published articles found');
    return;
  }

  if (members.length < 3) {
    console.log('⚠️ Skipping article comments seed: not enough members found');
    return;
  }

  const a1 = articles[0];
  const a2 = articles[1] ?? articles[0];
  const a3 = articles[2] ?? articles[0];

  const m1 = members[0];
  const m2 = members[1];
  const m3 = members[2];
  const m4 = members[3] ?? members[0];
  const m5 = members[4] ?? members[1];
  const m6 = members[5] ?? members[2];

  const comments = [
    {
      uid: 'article_comment_root_1',
      articleUid: a1.uid,
      parentUid: null,
      authorUid: m1.uid,
      content:
        'This guide was super helpful. Especially the part about how to structure the first investor conversations.',
    },
    {
      uid: 'article_comment_reply_1',
      articleUid: a1.uid,
      parentUid: 'article_comment_root_1',
      authorUid: m2.uid,
      content:
        'Same here. I also liked the checklist at the end — it made the next steps much clearer.',
    },
    {
      uid: 'article_comment_reply_2',
      articleUid: a1.uid,
      parentUid: 'article_comment_root_1',
      authorUid: m3.uid,
      content:
        'Would be great to expand this with a sample outreach template for founders.',
    },
    {
      uid: 'article_comment_root_2',
      articleUid: a1.uid,
      parentUid: null,
      authorUid: m4.uid,
      content:
        'One suggestion: add a short section on common mistakes founders make in the first fundraising deck.',
    },
    {
      uid: 'article_comment_root_3',
      articleUid: a2.uid,
      parentUid: null,
      authorUid: m2.uid,
      content:
        'Nice write-up. I used parts of this process last week and it saved me a lot of time.',
    },
    {
      uid: 'article_comment_reply_3',
      articleUid: a2.uid,
      parentUid: 'article_comment_root_3',
      authorUid: m5.uid,
      content:
        'Did you adapt it for pre-seed or seed? Curious because our situation is a bit earlier-stage.',
    },
    {
      uid: 'article_comment_root_4',
      articleUid: a3.uid,
      parentUid: null,
      authorUid: m6.uid,
      content:
        'Helpful overview. It would also be nice to include a short FAQ with edge cases.',
    },
  ];

  for (const row of comments) {
    await prisma.articleComment.upsert({
      where: { uid: row.uid },
      create: {
        uid: row.uid,
        articleUid: row.articleUid,
        parentUid: row.parentUid,
        authorUid: row.authorUid,
        content: row.content,
      },
      update: {
        articleUid: row.articleUid,
        parentUid: row.parentUid,
        authorUid: row.authorUid,
        content: row.content,
      },
    });
  }

  const likes = [
    {
      uid: 'article_comment_like_1',
      commentUid: 'article_comment_root_1',
      memberUid: m2.uid,
    },
    {
      uid: 'article_comment_like_2',
      commentUid: 'article_comment_root_1',
      memberUid: m3.uid,
    },
    {
      uid: 'article_comment_like_3',
      commentUid: 'article_comment_reply_1',
      memberUid: m1.uid,
    },
    {
      uid: 'article_comment_like_4',
      commentUid: 'article_comment_root_2',
      memberUid: m2.uid,
    },
    {
      uid: 'article_comment_like_5',
      commentUid: 'article_comment_root_3',
      memberUid: m1.uid,
    },
    {
      uid: 'article_comment_like_6',
      commentUid: 'article_comment_root_3',
      memberUid: m4.uid,
    },
    {
      uid: 'article_comment_like_7',
      commentUid: 'article_comment_reply_3',
      memberUid: m2.uid,
    },
  ];

  for (const row of likes) {
    await prisma.articleCommentLike.upsert({
      where: {
        commentUid_memberUid: {
          commentUid: row.commentUid,
          memberUid: row.memberUid,
        },
      },
      create: {
        uid: row.uid,
        commentUid: row.commentUid,
        memberUid: row.memberUid,
      },
      update: {},
    });
  }

  const commentUids = comments.map((x) => x.uid);

  for (const commentUid of commentUids) {
    const count = await prisma.articleCommentLike.count({
      where: { commentUid },
    });

    await prisma.articleComment.update({
      where: { uid: commentUid },
      data: { likesCount: count },
    });
  }

  console.log(`✅ Added ${comments.length} article comments`);
  console.log(`✅ Added ${likes.length} article comment likes`);
  console.log('=== Seed: article comments (done) ===');
}
