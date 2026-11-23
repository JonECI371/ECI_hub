-- Courses that are the same course in another format (classroom, live online, eLearning) share a key, so the course page can offer a switch between them.
ALTER TABLE "Course" ADD COLUMN "formatGroup" TEXT;
CREATE INDEX "Course_formatGroup_idx" ON "Course"("formatGroup");
