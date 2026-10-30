import ast
from radon.complexity import cc_visit


# ---------------------------------
# BUG PREDICTION HEATMAP
# ---------------------------------

def bug_prediction_heatmap(code):

    try:
        blocks = cc_visit(code)
        results = []

        for block in blocks:

            if block.complexity >= 10:
                risk = "HIGH 🔴"
            elif block.complexity >= 5:
                risk = "MEDIUM 🟠"
            else:
                risk = "LOW 🟢"

            results.append({
                "function": block.name,
                "line": block.lineno,
                "complexity": block.complexity,
                "risk": risk
            })

        return results

    except Exception as e:
        return {"error": str(e)}


# ---------------------------------
# AUTO CODE REFACTOR
# ---------------------------------

class IndexedReadRewriter(ast.NodeTransformer):
    """Replaces every read of array[index] with `item`."""

    def __init__(self, array, index):
        self.array = ast.dump(array)
        self.index = index

    def visit_Subscript(self, node):
        if (
            isinstance(node.ctx, ast.Load)
            and isinstance(node.slice, ast.Name)
            and node.slice.id == self.index
            and ast.dump(node.value) == self.array
        ):
            return ast.Name(id="item", ctx=ast.Load())

        return self.generic_visit(node)


def _can_drop_index(node, array):
    """True only if the index is used solely to read array[index]."""

    if not isinstance(node.target, ast.Name):
        return False

    index = node.target.id
    array_dump = ast.dump(array)
    body = ast.Module(body=node.body + node.orelse, type_ignores=[])

    allowed = set()
    for child in ast.walk(body):
        if isinstance(child, ast.Name) and child.id == "item":
            return False
        if (
            isinstance(child, ast.Subscript)
            and isinstance(child.ctx, ast.Load)
            and isinstance(child.slice, ast.Name)
            and child.slice.id == index
            and ast.dump(child.value) == array_dump
        ):
            allowed.add(id(child.slice))

    for child in ast.walk(body):
        if isinstance(child, ast.Name) and child.id == index and id(child) not in allowed:
            return False

    return True


class RefactorTransformer(ast.NodeTransformer):

    def visit_For(self, node):

        self.generic_visit(node)

        if (
            isinstance(node.iter, ast.Call)
            and isinstance(node.iter.func, ast.Name)
            and node.iter.func.id == "range"
        ):

            args = node.iter.args

            if (
                len(args) == 1
                and isinstance(args[0], ast.Call)
                and isinstance(args[0].func, ast.Name)
                and args[0].func.id == "len"
            ):

                array_name = args[0].args[0]

                # Loops that write to the array or use the index for anything
                # else can't lose the index, so they're left unchanged.
                if not _can_drop_index(node, array_name):
                    return node

                rewriter = IndexedReadRewriter(array_name, node.target.id)
                node.body = [rewriter.visit(stmt) for stmt in node.body]
                node.orelse = [rewriter.visit(stmt) for stmt in node.orelse]
                node.target = ast.Name(id="item", ctx=ast.Store())
                node.iter = array_name

        return node


def auto_refactor(code):

    try:
        tree = ast.parse(code)

        transformer = RefactorTransformer()
        new_tree = transformer.visit(tree)

        refactored = ast.unparse(new_tree)

        return {
            "original": code,
            "refactored": refactored
        }

    except Exception as e:
        return {"error": str(e)}