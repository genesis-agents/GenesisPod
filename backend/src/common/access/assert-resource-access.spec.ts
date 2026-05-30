import { NotFoundException } from "@nestjs/common";
import { ContentVisibility } from "@prisma/client";
import { assertResourceAccess } from "./assert-resource-access";

describe("assertResourceAccess", () => {
  const requester = { userId: "user-1" };

  it("放行：own（resource.userId === requester.userId）", async () => {
    await expect(
      assertResourceAccess(
        { userId: "user-1", visibility: ContentVisibility.PRIVATE },
        requester,
      ),
    ).resolves.toBeUndefined();
  });

  it("放行：own 即使 visibility 缺省（按 PRIVATE 处理）", async () => {
    await expect(
      assertResourceAccess({ userId: "user-1" }, requester),
    ).resolves.toBeUndefined();
  });

  it("404：他人 PRIVATE", async () => {
    await expect(
      assertResourceAccess(
        { userId: "owner-x", visibility: ContentVisibility.PRIVATE },
        requester,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404：visibility 缺省（按 PRIVATE）且非所有者", async () => {
    await expect(
      assertResourceAccess({ userId: "owner-x" }, requester),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("放行：SHARED 且 isTopicMember=true", async () => {
    const isTopicMember = jest.fn().mockResolvedValue(true);
    await expect(
      assertResourceAccess(
        {
          userId: "owner-x",
          visibility: ContentVisibility.SHARED,
          topicId: "topic-1",
        },
        requester,
        { isTopicMember },
      ),
    ).resolves.toBeUndefined();
    expect(isTopicMember).toHaveBeenCalledWith("topic-1", "user-1");
  });

  it("404：SHARED 且非成员（isTopicMember=false）", async () => {
    const isTopicMember = jest.fn().mockResolvedValue(false);
    await expect(
      assertResourceAccess(
        {
          userId: "owner-x",
          visibility: ContentVisibility.SHARED,
          topicId: "topic-1",
        },
        requester,
        { isTopicMember },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("404：SHARED 但 topicId 为空（无 Topic 上下文，不放行非所有者）", async () => {
    const isTopicMember = jest.fn().mockResolvedValue(true);
    await expect(
      assertResourceAccess(
        {
          userId: "owner-x",
          visibility: ContentVisibility.SHARED,
          topicId: null,
        },
        requester,
        { isTopicMember },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(isTopicMember).not.toHaveBeenCalled();
  });

  it("404：SHARED 有 topicId 但未注入 isTopicMember 回调", async () => {
    await expect(
      assertResourceAccess(
        {
          userId: "owner-x",
          visibility: ContentVisibility.SHARED,
          topicId: "topic-1",
        },
        requester,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("放行：PUBLIC（无需 Topic 查询）", async () => {
    const isTopicMember = jest.fn();
    await expect(
      assertResourceAccess(
        { userId: "owner-x", visibility: ContentVisibility.PUBLIC },
        requester,
        { isTopicMember },
      ),
    ).resolves.toBeUndefined();
    expect(isTopicMember).not.toHaveBeenCalled();
  });
});
