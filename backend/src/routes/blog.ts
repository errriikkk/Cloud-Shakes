import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { protect, AuthRequest } from '../middleware/authMiddleware';

const router = Router();
const prisma = new PrismaClient();

// GET /api/blog - Listar posts (público)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { locale = 'es', limit = '10', offset = '0', featured, category, tag } = req.query;

    const where: any = {
      published: true,
      locale: locale as string,
    };

    if (featured === 'true') {
      where.featured = true;
    }

    if (category) {
      where.category = category;
    }

    if (tag) {
      where.tags = { has: tag as string };
    }

    const posts = await (prisma as any).blogPost.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        author: true,
        tags: true,
        category: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    const count = await (prisma as any).blogPost.count({
      where
    });


    res.json({ posts, total: count, limit: parseInt(limit as string), offset: parseInt(offset as string) });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ error: 'Error fetching blog posts' });
  }
});

// GET /api/blog/:slug - Obtener post por slug (público)
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { locale = 'es' } = req.query;

    const post = await (prisma as any).blogPost.findFirst({

      where: {
        slug: slug as string,
        locale: locale as string,
        published: true,
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: 'Error fetching blog post' });
  }
});

// GET /api/blog/featured - Obtener post destacado (público)
router.get('/featured', async (req: Request, res: Response) => {
  try {
    const { locale = 'es' } = req.query;

    const post = await (prisma as any).blogPost.findFirst({

      where: {
        locale: locale as string,
        published: true,
        featured: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    res.json(post);
  } catch (error) {
    console.error('Error fetching featured post:', error);
    res.status(500).json({ error: 'Error fetching featured post' });
  }
});

// GET /api/blog/categories - Listar categorías (público)
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const { locale = 'es' } = req.query;

    const stats = await (prisma as any).blogPost.groupBy({

      where: {
        locale: locale as string,
        published: true,
      },
      select: { category: true },
      distinct: ['category'],
    });

    res.json(stats.map(c => c.category));
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Error fetching categories' });
  }
});

// GET /api/blog/tags - Listar tags (público)
router.get('/tags', async (req: Request, res: Response) => {
  try {
    const { locale = 'es' } = req.query;

    const posts = await (prisma as any).blogPost.findMany({
      where: {
        locale: locale as string,
        published: true,
      },
      select: { tags: true },
    });

    const allTags = posts.flatMap(p => p.tags);
    const uniqueTags = [...new Set(allTags)];

    res.json(uniqueTags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Error fetching tags' });
  }
});

// POST /api/blog - Crear post (protegido)
router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      slug, 
      locale = 'es',
      title, 
      excerpt, 
      content, 
      coverImage,
      seoTitle,
      seoDescription,
      author,
      tags = [],
      category = 'general',
      published = false,
      featured = false,
    } = req.body;

    // Verificar si el slug ya existe
    const existing = await (prisma as any).blogPost.findUnique({
      where: { slug },
    });

    if (existing) {
      return res.status(400).json({ error: 'Slug already exists' });
    }

    const post = await (prisma as any).blogPost.create({


      data: {
        slug,
        locale,
        title,
        excerpt,
        content,
        coverImage,
        seoTitle,
        seoDescription,
        author,
        tags,
        category,
        published,
        featured,
        publishedAt: published ? new Date() : null,
        authorId: req.user?.id,
      },
    });

    res.json(post);
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Error creating blog post' });
  }
});

// PUT /api/blog/:id - Actualizar post (protegido)
router.put('/:id', protect, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      slug,
      locale,
      title, 
      excerpt, 
      content, 
      coverImage,
      seoTitle,
      seoDescription,
      author,
      tags,
      category,
      published,
      featured,
    } = req.body;

    // Verificar si el post existe
    const existing = await prisma.blogPost.findUnique({
      where: { id: id as string },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Si se cambia el slug, verificar que no exista
    if (slug && slug !== existing.slug) {
      const slugExists = await prisma.blogPost.findUnique({
        where: { slug: slug as string },
      });
      if (slugExists) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
    }

    // Si se publica por primera vez, establecer publishedAt
    let publishedAt = existing.publishedAt;
    if (published && !existing.published) {
      publishedAt = new Date();
    }

    const post = await (prisma as any).blogPost.update({

      where: { id: id as string },
      data: {
        ...(slug && { slug: slug as string }),
        ...(locale && { locale }),
        title,
        excerpt,
        content,
        coverImage,
        seoTitle,
        seoDescription,
        author,
        tags,
        category,
        published,
        featured,
        publishedAt,
      },
    });

    res.json(post);
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Error updating blog post' });
  }
});

// DELETE /api/blog/:id - Eliminar post (protegido)
router.delete('/:id', protect, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.blogPost.delete({
      where: { id: id as string },
    });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Error deleting blog post' });
  }
});

// GET /api/blog/admin/all - Listar todos los posts para admin (protegido)
router.get('/admin/all', protect, async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    const posts = await (prisma as any).blogPost.findMany({
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const total = await (prisma as any).blogPost.count();


    res.json({ posts, total });
  } catch (error) {
    console.error('Error fetching all posts:', error);
    res.status(500).json({ error: 'Error fetching all posts' });
  }
});

export default router;
