import { Router, Request, Response } from 'express';
import { upload } from '../middleware/fileUpload.js';
import { KnowledgeBaseService } from '../services/knowledgeBaseService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const router = Router();

// All routes require authentication AND organization context
// SEC-004 FIX: Added requireOrganization to prevent unauthorized access
router.use(requireAuth);
router.use(requireOrganization);

/**
 * Upload brand document
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: { message: 'No file uploaded' } });
        }

        const { title } = req.body;
        // SEC-004 FIX: Use organization context instead of legacy user.id
        const organizationId = req.org!.organization.id;

        // Extract text content based on file type
        let content = '';
        const filePath = req.file.path;
        const ext = req.file.originalname.split('.').pop()?.toLowerCase();

        if (ext === 'pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            content = pdfData.text;
        } else if (ext === 'txt' || ext === 'md') {
            content = fs.readFileSync(filePath, 'utf-8');
        } else {
            // For DOCX, we'd need another library - skip for now
            content = 'Document uploaded (content extraction not yet supported for this format)';
        }

        // Add to knowledge base
        await KnowledgeBaseService.addDocument(
            organizationId,
            title || req.file.originalname,
            content
        );

        res.json({
            success: true,
            data: {
                filename: req.file.originalname,
                title: title || req.file.originalname,
                size: req.file.size
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error uploading document:', error);
        res.status(500).json({ error: { message: err.message } });
    }
});

/**
 * List all documents for organization
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        // SEC-004 FIX: Use organization context
        const organizationId = req.org!.organization.id;

        // For now, return empty array since we don't have a documents table yet
        // This would query the knowledge_base table once pgvector is set up
        res.json({
            success: true,
            data: {
                documents: []
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching documents:', error);
        res.status(500).json({ error: { message: err.message } });
    }
});

/**
 * Delete document by ID
 * Removes all chunks associated with the document
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // SEC-004 FIX: Use organization context
        const organizationId = req.org!.organization.id;

        const result = await KnowledgeBaseService.deleteDocument(organizationId, id);

        res.json({
            success: true,
            data: {
                message: 'Document deleted',
                chunksDeleted: result.deleted
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error deleting document:', error);
        if (err.message === 'Document not found or access denied') {
            return res.status(404).json({ error: { message: err.message } });
        }
        res.status(500).json({ error: { message: err.message } });
    }
});

/**
 * Get all documents for the current organization
 */
router.get('/documents', async (req: Request, res: Response) => {
    try {
        // SEC-004 FIX: Use organization context
        const organizationId = req.org!.organization.id;

        const documents = await KnowledgeBaseService.getDocuments(organizationId);

        res.json({
            success: true,
            data: documents
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching documents:', error);
        res.status(500).json({ error: { message: err.message } });
    }
});

export default router;
