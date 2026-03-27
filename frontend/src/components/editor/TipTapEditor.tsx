"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough,
    Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare,
    Quote, Code, Link as LinkIcon, Image as ImageIcon,
    Table as TableIcon, Undo, Redo, Minus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TipTapEditorProps {
    content: any;
    onChange: (content: any) => void;
    editable?: boolean;
    placeholder?: string;
}

function ToolbarButton({
    icon: Icon,
    onClick,
    label,
    isActive,
    disabled
}: {
    icon: any;
    onClick: () => void;
    label: string;
    isActive?: boolean;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            className={cn(
                "p-2 rounded-lg transition-all duration-200",
                isActive 
                    ? "bg-primary/20 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
            )}
        >
            <Icon className="w-4 h-4" />
        </button>
    );
}

export function TipTapEditor({ 
    content, 
    onChange, 
    editable = true,
    placeholder = "Empieza a escribir..."
}: TipTapEditorProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: "text-primary underline",
                },
            }),
            Image.configure({
                HTMLAttributes: {
                    class: "rounded-lg max-w-full",
                },
            }),
            Placeholder.configure({
                placeholder,
            }),
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: content || "",
        editable,
        onUpdate: ({ editor }) => {
            const json = editor.getJSON();
            onChange(json);
        },
        editorProps: {
            attributes: {
                class: "prose prose-sm sm:prose-base lg:prose-lg max-w-none focus:outline-none min-h-[300px]",
            },
        },
    });

    const setLink = useCallback(() => {
        if (!editor) return;
        
        const previousUrl = editor.getAttributes("link").href;
        const url = window.prompt("URL", previousUrl);
        
        if (url === null) return;
        
        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }
        
        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }, [editor]);

    const addImage = useCallback(() => {
        if (!editor) return;
        
        const url = window.prompt("URL de la imagen");
        
        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    }, [editor]);

    const addTable = useCallback(() => {
        if (!editor) return;
        
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }, [editor]);

    if (!isMounted) {
        return <div className="min-h-[300px] animate-pulse bg-muted/20 rounded-lg" />;
    }

    if (!editor) {
        return null;
    }

    return (
        <div className="border-0">
            {/* Toolbar */}
            {editable && (
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border border-border/40 rounded-xl p-2 mb-4 flex flex-wrap items-center gap-1 shadow-sm">
                    {/* Text Format */}
                    <ToolbarButton 
                        icon={Bold} 
                        onClick={() => editor.chain().focus().toggleBold().run()} 
                        label="Negrita"
                        isActive={editor.isActive("bold")}
                    />
                    <ToolbarButton 
                        icon={Italic} 
                        onClick={() => editor.chain().focus().toggleItalic().run()} 
                        label="Cursiva"
                        isActive={editor.isActive("italic")}
                    />
                    <ToolbarButton 
                        icon={UnderlineIcon} 
                        onClick={() => editor.chain().focus().toggleUnderline().run()} 
                        label="Subrayado"
                        isActive={editor.isActive("underline")}
                    />
                    <ToolbarButton 
                        icon={Strikethrough} 
                        onClick={() => editor.chain().focus().toggleStrike().run()} 
                        label="Tachado"
                        isActive={editor.isActive("strike")}
                    />
                    
                    <div className="w-px h-6 bg-border mx-1" />
                    
                    {/* Headings */}
                    <ToolbarButton 
                        icon={Heading1} 
                        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
                        label="Título 1"
                        isActive={editor.isActive("heading", { level: 1 })}
                    />
                    <ToolbarButton 
                        icon={Heading2} 
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
                        label="Título 2"
                        isActive={editor.isActive("heading", { level: 2 })}
                    />
                    <ToolbarButton 
                        icon={Heading3} 
                        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} 
                        label="Título 3"
                        isActive={editor.isActive("heading", { level: 3 })}
                    />
                    
                    <div className="w-px h-6 bg-border mx-1" />
                    
                    {/* Lists */}
                    <ToolbarButton 
                        icon={List} 
                        onClick={() => editor.chain().focus().toggleBulletList().run()} 
                        label="Lista"
                        isActive={editor.isActive("bulletList")}
                    />
                    <ToolbarButton 
                        icon={ListOrdered} 
                        onClick={() => editor.chain().focus().toggleOrderedList().run()} 
                        label="Lista ordenada"
                        isActive={editor.isActive("orderedList")}
                    />
                    <ToolbarButton 
                        icon={CheckSquare} 
                        onClick={() => editor.chain().focus().toggleTaskList().run()} 
                        label="Checklist"
                        isActive={editor.isActive("taskList")}
                    />
                    
                    <div className="w-px h-6 bg-border mx-1" />
                    
                    {/* Blocks */}
                    <ToolbarButton 
                        icon={Quote} 
                        onClick={() => editor.chain().focus().toggleBlockquote().run()} 
                        label="Cita"
                        isActive={editor.isActive("blockquote")}
                    />
                    <ToolbarButton 
                        icon={Code} 
                        onClick={() => editor.chain().focus().toggleCodeBlock().run()} 
                        label="Código"
                        isActive={editor.isActive("codeBlock")}
                    />
                    <ToolbarButton 
                        icon={Minus} 
                        onClick={() => editor.chain().focus().setHorizontalRule().run()} 
                        label="Separador"
                    />
                    
                    <div className="w-px h-6 bg-border mx-1" />
                    
                    {/* Insert */}
                    <ToolbarButton 
                        icon={LinkIcon} 
                        onClick={setLink} 
                        label="Enlace"
                        isActive={editor.isActive("link")}
                    />
                    <ToolbarButton 
                        icon={ImageIcon} 
                        onClick={addImage} 
                        label="Imagen"
                    />
                    <ToolbarButton 
                        icon={TableIcon} 
                        onClick={addTable} 
                        label="Tabla"
                    />
                    
                    <div className="w-px h-6 bg-border mx-1" />
                    
                    {/* History */}
                    <ToolbarButton 
                        icon={Undo} 
                        onClick={() => editor.chain().focus().undo().run()} 
                        label="Deshacer"
                        disabled={!editor.can().undo()}
                    />
                    <ToolbarButton 
                        icon={Redo} 
                        onClick={() => editor.chain().focus().redo().run()} 
                        label="Rehacer"
                        disabled={!editor.can().redo()}
                    />
                </div>
            )}
            
            {/* Editor Content */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                    "prose prose-sm sm:prose-base lg:prose-lg max-w-none",
                    "prose-headings:font-bold prose-headings:tracking-tight",
                    "prose-p:text-foreground/90",
                    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                    "prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic",
                    "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none",
                    "prose-pre:bg-muted prose-pre:rounded-xl",
                    "prose-img:rounded-xl prose-img:shadow-lg",
                    "prose-table:border-collapse prose-table:w-full prose-table:border prose-table:border-border",
                    "prose-th:bg-muted/50 prose-th:p-2 prose-th:border prose-th:border-border",
                    "prose-td:p-2 prose-td:border prose-td:border-border",
                    "prose-ul:list-disc prose-ol:list-decimal",
                    "prose-li:marker:text-primary",
                    "[&_ul[data-type='taskList']]:list-none [&_ul[data-type='taskList']]:pl-0",
                    "[&_ul[data-type='taskList']_li]:flex [&_ul[data-type='taskList']_li]:items-center [&_ul[data-type='taskList']_li]:gap-2",
                    "[&_ul[data-type='taskList']_li>label]:flex-shrink-0 [&_ul[data-type='taskList']_li>label]:cursor-pointer",
                    "[&_ul[data-type='taskList']_li>div]:flex-1",
                    "focus:outline-none"
                )}
            >
                <EditorContent editor={editor} />
            </motion.div>
        </div>
    );
}
